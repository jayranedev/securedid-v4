"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AddressPill, getFactoryRead, getRegistryRead, explorerAddress, queryFilterAll } from "@securedid/shared";
import { FACTORY_ADDRESS } from "@/lib/env";

interface Stats {
  registry:        string;
  name:            string;
  website:         string;
  deployedAt:      number;
  owner:           string;
  studentCount:    number;
  revocationCount: number;
  proposalCount:   number;
}

export default function Home() {
  const [rows, setRows]    = useState<Stats[]>([]);
  const [loading, setLoad] = useState(true);
  const [error, setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!FACTORY_ADDRESS) { setError("NEXT_PUBLIC_FACTORY_ADDRESS not configured"); setLoad(false); return; }
    (async () => {
      try {
        const factory = getFactoryRead(FACTORY_ADDRESS);
        const addrs: string[] = await factory.getRegistries();
        const out = await Promise.all(addrs.map(async (r) => {
          const [info, reg] = await Promise.all([
            factory.getInstitution(r),
            Promise.resolve(getRegistryRead(r)),
          ]);
          const deployedAt = Number(info.deployedAt);
          const [studentCount, revocationCount, nextId] = await Promise.all([
            queryFilterAll(reg, reg.filters.DIDIssued(), { fromTimestamp: deployedAt }).then((e) => e.length).catch(() => 0),
            reg.nextRevocationIndex().then((n: bigint) => Number(n)).catch(() => 0),
            reg.nextProposalId().then((n: bigint) => Number(n)).catch(() => 1),
          ]);
          return {
            registry: r.toLowerCase(), name: info.name as string, website: info.website as string,
            deployedAt: Number(info.deployedAt), owner: (info.deployer as string).toLowerCase(),
            studentCount, revocationCount, proposalCount: Math.max(0, nextId - 1),
          };
        }));
        out.sort((a, b) => b.deployedAt - a.deployedAt);
        setRows(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally { setLoad(false); }
    })();
  }, []);

  const totalStudents  = rows.reduce((a, r) => a + r.studentCount, 0);
  const totalRevoked   = rows.reduce((a, r) => a + r.revocationCount, 0);
  const totalProposals = rows.reduce((a, r) => a + r.proposalCount, 0);

  return (
    <div className="sd-page">
      <div className="sd-page-header">
        <div className="sd-eyebrow">On-chain</div>
        <h1 className="sd-page-title">SecureDID Explorer</h1>
        <p className="sd-page-sub">All institution registries deployed via the SecureDID factory on Base Sepolia.</p>
        {FACTORY_ADDRESS && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "var(--fg-3)" }}>
            <span>Factory:</span>
            <AddressPill address={FACTORY_ADDRESS} />
            <a href={explorerAddress(FACTORY_ADDRESS)} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent)", fontSize: 12 }}>↗ Blockscout</a>
          </div>
        )}
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {!loading && rows.length > 0 && (
        <div className="sd-stat-grid" style={{ marginBottom: 32 }}>
          <div className="sd-stat">
            <div className="sd-stat__label">Institutions</div>
            <div className="sd-stat__value">{rows.length}</div>
          </div>
          <div className="sd-stat">
            <div className="sd-stat__label">Students</div>
            <div className="sd-stat__value">{totalStudents}</div>
          </div>
          <div className="sd-stat">
            <div className="sd-stat__label">Proposals</div>
            <div className="sd-stat__value">{totalProposals}</div>
          </div>
          <div className="sd-stat">
            <div className="sd-stat__label">Revocations</div>
            <div className="sd-stat__value">{totalRevoked}</div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1].map((i) => <div key={i} className="sd-skel" style={{ height: 96 }} />)}
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
          </div>
          <div className="sd-empty__title">No registries deployed</div>
          <p className="sd-empty__sub">No registries have been deployed via this factory yet.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <Link key={r.registry} href={`/${r.registry}`} className="sd-card sd-card--pad" style={{ display: "block", textDecoration: "none", transition: "box-shadow var(--dur-fast) var(--ease-out)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ font: "var(--fw-semibold) 15px/1 var(--font-sans)", color: "var(--fg-1)" }}>{r.name}</div>
                  {r.website && <div style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--accent)", marginTop: 3 }}>{r.website}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--fg-3)" }}>
                    <AddressPill address={r.registry} head={8} tail={6} showExplorer={false} />
                    <span>·</span>
                    <span>{new Date(r.deployedAt * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, textAlign: "center" }}>
                  <MiniStat label="Students"  value={r.studentCount} />
                  <MiniStat label="Proposals" value={r.proposalCount} />
                  <MiniStat label="Revoked"   value={r.revocationCount} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ font: "var(--fw-semibold) 20px/1.2 var(--font-display)", color: "var(--fg-1)", marginTop: 4 }}>{value}</div>
    </div>
  );
}
