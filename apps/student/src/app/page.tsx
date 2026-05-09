"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet, AddressPill, getFactoryRead } from "@securedid/shared";
import { FACTORY_ADDRESS } from "@/lib/env";

interface Row {
  registry:   string;
  name:       string;
  website:    string;
  deployedAt: number;
}

export default function Home() {
  const { address } = useWallet();
  const [rows, setRows]    = useState<Row[]>([]);
  const [loading, setLoad] = useState(false);
  const [error, setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!FACTORY_ADDRESS) { setError("NEXT_PUBLIC_FACTORY_ADDRESS not configured"); return; }
    setLoad(true);
    (async () => {
      try {
        const factory = getFactoryRead(FACTORY_ADDRESS);
        const addrs: string[] = await factory.getRegistries();
        const out: Row[] = await Promise.all(addrs.map(async (r) => {
          const info = await factory.getInstitution(r);
          return { registry: r.toLowerCase(), name: info.name as string, website: info.website as string, deployedAt: Number(info.deployedAt) };
        }));
        setRows(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally { setLoad(false); }
    })();
  }, []);

  return (
    <div className="sd-page" style={{ maxWidth: 1200 }}>
      {/* ─── Hero ─── */}
      <div className="sd-page-header">
        <div className="sd-eyebrow">Identity</div>
        <h1 className="sd-page-title">Student Dashboard</h1>
        <p className="sd-page-sub">Choose the registry where your panelists have authorized your enrollment. You&apos;ll register your wallet there, receive a DID, and manage access from the institution page.</p>
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {!address && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div className="sd-empty__title">Connect your wallet</div>
          <p className="sd-empty__sub">Connect your wallet to see your registration status at each institution.</p>
        </div>
      )}

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {[0, 1].map((i) => <div key={i} className="sd-skel" style={{ height: 180 }} />)}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {rows.map((r) => (
            <Link key={r.registry} href={`/${r.registry}`} className="sd-card"
              style={{ display: "flex", flexDirection: "column", textDecoration: "none", overflow: "hidden" }}>
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "var(--radius-lg)",
                  background: "linear-gradient(135deg, var(--accent-100), var(--accent-50))",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)",
                }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-4h6v4" /></svg>
                </div>
                <div>
                  <div style={{ font: "var(--fw-semibold) 18px/1.3 var(--font-heading)", color: "var(--fg-1)" }}>{r.name}</div>
                  {r.website && <div style={{ font: "var(--fw-regular) 13px/1 var(--font-sans)", color: "var(--accent)", marginTop: 4 }}>{r.website}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <AddressPill address={r.registry} showExplorer={false} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="sd-pill sd-pill--active" style={{ fontSize: 9 }}><span className="sd-pill__dot" /> Active Node</span>
                  <span style={{ fontSize: 11, color: "var(--fg-4)" }}>Deployed {new Date(r.deployedAt * 1000).toLocaleDateString()}</span>
                </div>
              </div>
              <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-subtle)", font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Open dashboard</span>
                <span style={{ fontSize: 16 }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && !error && address && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__title">No institutions deployed yet</div>
          <p className="sd-empty__sub">Ask your institution admin to deploy a DID registry.</p>
        </div>
      )}
    </div>
  );
}
