"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet, AddressPill } from "@securedid/shared";
import { listRegistries, RegistryRow, FACTORY_ADDRESS } from "@/lib/factory";
import { RegistryCard } from "@/components/RegistryCard";

export default function Dashboard() {
  const { address } = useWallet();
  const [rows, setRows]    = useState<RegistryRow[]>([]);
  const [loading, setLoad] = useState(false);
  const [error, setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!FACTORY_ADDRESS) {
      setError("NEXT_PUBLIC_FACTORY_ADDRESS is not configured. Deploy the factory and set the env var.");
      return;
    }
    setLoad(true);
    listRegistries()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoad(false));
  }, []);

  const mine = useMemo(() => {
    if (!address) return [];
    return rows.filter((r) => r.deployer === address);
  }, [rows, address]);

  return (
    <div className="sd-page" style={{ maxWidth: 1200 }}>
      <div className="sd-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="sd-eyebrow">Dashboard</div>
          <h1 className="sd-page-title">My Institutions</h1>
          <p className="sd-page-sub">DID registries you&apos;ve deployed with this wallet, backed by the SecureDID Factory.</p>
        </div>
        <Link href="/create" className="sd-btn sd-btn--primary sd-btn--lg">+ Create Registry</Link>
      </div>

      {FACTORY_ADDRESS && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--fg-3)", marginBottom: 24 }}>
          <span className="sd-pill sd-pill--active"><span className="sd-pill__dot" /> Base Sepolia</span>
          <span>Factory:</span>
          <AddressPill address={FACTORY_ADDRESS} />
        </div>
      )}

      {error && (
        <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>
          <div>{error}</div>
        </div>
      )}

      {!address && !error && (
        <div className="sd-card sd-card--pad" style={{ textAlign: "center", padding: "56px 24px" }}>
          <div className="sd-empty__illus" style={{ margin: "0 auto 16px" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div className="sd-empty__title">Connect your wallet</div>
          <p className="sd-empty__sub">Use the button in the top-right to connect a wallet on Base Sepolia. Only institutions deployed by your wallet will be shown here.</p>
        </div>
      )}

      {address && !error && (
        <section style={{ marginBottom: 32 }}>
          {loading ? (
            <SkeletonList />
          ) : mine.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {mine.map((r) => <RegistryCard key={r.address} row={r} />)}
            </div>
          )}
        </section>
      )}

      {rows.length > mine.length && address && (
        <section style={{ paddingTop: 24, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ font: "var(--fw-semibold) 17px/1 var(--font-heading)", color: "var(--fg-1)" }}>Other institutions</h2>
            <Link href="/explore" style={{ font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--accent)" }}>See all →</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {rows.filter((r) => r.deployer !== address).slice(0, 4).map((r) => (
              <RegistryCard key={r.address} row={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
      {[0, 1].map((i) => <div key={i} className="sd-skel" style={{ height: 140 }} />)}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="sd-card sd-card--pad sd-empty">
      <div className="sd-empty__illus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>
      </div>
      <div className="sd-empty__title">No institutions yet</div>
      <p className="sd-empty__sub">Deploy your first DID registry. You&apos;ll choose five panelists and a name; the factory handles the rest.</p>
      <Link href="/create" className="sd-btn sd-btn--primary" style={{ marginTop: 20 }}>+ Create your first registry</Link>
    </div>
  );
}
