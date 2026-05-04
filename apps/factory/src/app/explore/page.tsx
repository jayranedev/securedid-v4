"use client";

import { useEffect, useState } from "react";
import { listRegistries, RegistryRow, FACTORY_ADDRESS } from "@/lib/factory";
import { RegistryCard } from "@/components/RegistryCard";
import { AddressPill } from "@securedid/shared";

export default function ExplorePage() {
  const [rows, setRows]   = useState<RegistryRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoad] = useState(false);
  const [error, setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!FACTORY_ADDRESS) { setError("NEXT_PUBLIC_FACTORY_ADDRESS is not configured."); return; }
    setLoad(true);
    listRegistries()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoad(false));
  }, []);

  const filtered = rows.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.website.toLowerCase().includes(q) || r.address.includes(q) || r.deployer.includes(q);
  });

  return (
    <div className="sd-page">
      <div className="sd-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="sd-eyebrow">Factory</div>
          <h1 className="sd-page-title">Explore Institutions</h1>
          <p className="sd-page-sub">All DID registries deployed by the SecureDID Factory. Data read live from Base Sepolia.</p>
        </div>
      </div>

      {FACTORY_ADDRESS && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-3)", marginBottom: 20 }}>
          <span>Factory:</span>
          <AddressPill address={FACTORY_ADDRESS} />
        </div>
      )}

      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, website, address…"
        className="sd-input" style={{ marginBottom: 20 }} />

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 20 }}>{error}</div>}

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="sd-skel" style={{ height: 140 }} />)}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          </div>
          <div className="sd-empty__title">{rows.length === 0 ? "No registries deployed yet" : "No results found"}</div>
          <p className="sd-empty__sub">{rows.length === 0 ? "Deploy the first registry from the Factory dashboard." : "Try a different search term."}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--fg-4)", marginBottom: 16 }}>
            Showing {filtered.length} of {rows.length}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {filtered.map((r) => <RegistryCard key={r.address} row={r} />)}
          </div>
        </>
      )}
    </div>
  );
}
