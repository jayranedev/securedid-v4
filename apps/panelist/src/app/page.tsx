"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet, AddressPill, getFactoryRead, getRegistryRead } from "@securedid/shared";
import { FACTORY_ADDRESS } from "@/lib/env";

interface Row {
  registry:   string;
  name:       string;
  website:    string;
  deployedAt: number;
  isPanelist: boolean;
}

export default function Home() {
  const { address } = useWallet();
  const [rows, setRows]   = useState<Row[]>([]);
  const [loading, setLoad] = useState(false);
  const [error, setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!FACTORY_ADDRESS) { setError("NEXT_PUBLIC_FACTORY_ADDRESS is not configured."); return; }
    if (!address) return;
    setLoad(true);
    (async () => {
      try {
        const factory = getFactoryRead(FACTORY_ADDRESS);
        const addrs: string[] = await factory.getRegistries();
        const out: Row[] = await Promise.all(addrs.map(async (r) => {
          const info = await factory.getInstitution(r);
          const reg = getRegistryRead(r);
          const isP = await reg.isPanelist(address);
          return {
            registry: r.toLowerCase(),
            name: info.name as string,
            website: info.website as string,
            deployedAt: Number(info.deployedAt),
            isPanelist: isP as boolean,
          };
        }));
        setRows(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally { setLoad(false); }
    })();
  }, [address]);

  const mine = rows.filter((r) => r.isPanelist);

  return (
    <div className="sd-page">
      <div className="sd-page-header">
        <div className="sd-eyebrow">Panelist</div>
        <h1 className="sd-page-title">My Panelist Seats</h1>
        <p className="sd-page-sub">Registries where your wallet is an authorized panelist. Open one to vote on proposals or approve pending students.</p>
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {!address && !error && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div className="sd-empty__title">Connect your wallet</div>
          <p className="sd-empty__sub">Connect MetaMask to see which registries have you as a panelist.</p>
        </div>
      )}

      {address && loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {[0, 1].map((i) => <div key={i} className="sd-skel" style={{ height: 130 }} />)}
        </div>
      )}

      {address && !loading && mine.length === 0 && !error && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <div className="sd-empty__title">You&apos;re not a panelist anywhere</div>
          <p className="sd-empty__sub">You need to be added via a 3-of-5 proposal on an existing registry, or be listed in a registry&apos;s initial panelists.</p>
        </div>
      )}

      {address && !loading && mine.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {mine.map((r) => (
            <Link key={r.registry} href={`/${r.registry}`} className="sd-seat">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="sd-seat__name">{r.name}</div>
                  {r.website && <div className="sd-seat__addr">{r.website}</div>}
                </div>
                <span className="sd-pill sd-pill--you">Panelist</span>
              </div>
              <div className="sd-seat__stats">
                <AddressPill address={r.registry} />
              </div>
              <div style={{ font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--accent)", marginTop: 12 }}>Open dashboard →</div>
            </Link>
          ))}
        </div>
      )}

      {address && !loading && rows.filter((r) => !r.isPanelist).length > 0 && (
        <details style={{ paddingTop: 20, borderTop: "1px solid var(--border-subtle)", marginTop: 24 }}>
          <summary style={{ font: "var(--fw-regular) 13px/1 var(--font-sans)", color: "var(--fg-3)", cursor: "pointer" }}>
            {rows.filter((r) => !r.isPanelist).length} other institutions (not a panelist)
          </summary>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.filter((r) => !r.isPanelist).map((r) => (
              <div key={r.registry} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--fg-2)" }}>{r.name}</span>
                <AddressPill address={r.registry} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
