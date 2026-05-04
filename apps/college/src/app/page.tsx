"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AddressPill, getFactoryRead } from "@securedid/shared";
import { FACTORY_ADDRESS } from "@/lib/env";

interface Institution {
  registry: string;
  name: string;
  website: string;
  deployedAt: number;
}

export default function Home() {
  const [rows, setRows]   = useState<Institution[]>([]);
  const [loading, setLoad] = useState(true);
  const [error, setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!FACTORY_ADDRESS) { setError("NEXT_PUBLIC_FACTORY_ADDRESS not configured"); setLoad(false); return; }
    (async () => {
      try {
        const factory = getFactoryRead(FACTORY_ADDRESS);
        const addrs: string[] = await factory.getRegistries();
        const out = await Promise.all(addrs.map(async (r) => {
          const info = await factory.getInstitution(r);
          return {
            registry: r.toLowerCase(),
            name: info[0] as string,
            website: info[1] as string,
            deployedAt: Number(info[2]),
          };
        }));
        out.sort((a, b) => b.deployedAt - a.deployedAt);
        setRows(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally { setLoad(false); }
    })();
  }, []);

  return (
    <div className="sd-page sd-page--md">
      <div className="sd-page-header">
        <div className="sd-eyebrow">College Portal</div>
        <h1 className="sd-page-title">Select your institution</h1>
        <p className="sd-page-sub">
          Choose your institution to check attendance. Your wallet must have an active access grant on that registry.
        </p>
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2].map((i) => <div key={i} className="sd-skel" style={{ height: 80 }} />)}
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
          </div>
          <div className="sd-empty__title">No institutions found</div>
          <p className="sd-empty__sub">No registries have been deployed via this factory yet.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <Link key={r.registry} href={`/${r.registry}`}
              className="sd-card sd-card--pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", gap: 16, transition: "box-shadow var(--dur-fast) var(--ease-out)" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: "var(--fw-semibold) 15px/1 var(--font-sans)", color: "var(--fg-1)" }}>{r.name}</div>
                {r.website && <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 3 }}>{r.website}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <AddressPill address={r.registry} head={8} tail={6} showExplorer={false} />
                  <span style={{ fontSize: 11, color: "var(--fg-4)" }}>{new Date(r.deployedAt * 1000).toLocaleDateString()}</span>
                </div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ width: 16, height: 16, color: "var(--fg-4)", flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
