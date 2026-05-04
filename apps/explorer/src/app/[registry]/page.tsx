"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import {
  AddressPill, getRegistryRead, explorerAddress, explorerTx,
  fetchAllProposals, ProposalSummary, proposalTypeLabel, decodeProposalData, ProposalType,
  queryFilterAll,
} from "@securedid/shared";

type EventKind = "DIDIssued" | "StudentRegistered" | "CredentialRevoked" | "ProposalCreated" | "ProposalExecuted" | "AccessGranted" | "AccessRevoked";

interface Entry {
  kind:    EventKind;
  block:   number;
  tx:      string;
  summary: string;
}

const FEED_CLASS: Record<EventKind, string> = {
  DIDIssued:         "sd-feed-did",
  StudentRegistered: "sd-feed-reg",
  CredentialRevoked: "sd-feed-rev",
  ProposalCreated:   "sd-feed-prop",
  ProposalExecuted:  "sd-feed-exec",
  AccessGranted:     "sd-feed-grant",
  AccessRevoked:     "sd-feed-rev",
};

export default function Page() {
  const params = useParams<{ registry: string }>();
  const registry = (params.registry ?? "").toLowerCase();

  const [name, setName]         = useState("Registry");
  const [panelists, setPanelists] = useState<string[]>([]);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [events, setEvents]     = useState<Entry[]>([]);
  const [filter, setFilter]     = useState<EventKind | "all">("all");
  const [loading, setLoad]      = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!registry) return;
    (async () => {
      try {
        const reg = getRegistryRead(registry);

        let deployedAt: number | undefined;
        const factoryAddr = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
        if (factoryAddr) {
          try {
            const f = new ethers.Contract(
              factoryAddr,
              ["function getInstitution(address) view returns (string,string,uint256,address)"],
              reg.runner,
            );
            const info = await f.getInstitution(registry);
            setName(info[0] as string);
            deployedAt = Number(info[2]);
          } catch { /* ignore */ }
        }

        const fromBlock = deployedAt ? { fromTimestamp: deployedAt } : undefined;

        const ps = await reg.getPanelists() as string[];
        setPanelists(ps.map((p) => p.toLowerCase()));

        const [issued, registered, revoked, created, executed, access, accessRev] = await Promise.all([
          queryFilterAll(reg, reg.filters.DIDIssued(), fromBlock),
          queryFilterAll(reg, reg.filters.StudentRegistered(), fromBlock),
          queryFilterAll(reg, reg.filters.CredentialRevoked(), fromBlock),
          queryFilterAll(reg, reg.filters.ProposalCreated(), fromBlock),
          queryFilterAll(reg, reg.filters.ProposalExecuted(), fromBlock),
          queryFilterAll(reg, reg.filters.AccessGranted(), fromBlock),
          queryFilterAll(reg, reg.filters.AccessRevoked(), fromBlock),
        ]);

        const out: Entry[] = [];
        const take = (kind: EventKind, list: ethers.EventLog[] | ethers.Log[], summary: (e: ethers.EventLog) => string) => {
          for (const raw of list) {
            const ev = raw as ethers.EventLog;
            out.push({ kind, block: ev.blockNumber, tx: ev.transactionHash, summary: summary(ev) });
          }
        };

        take("DIDIssued",         issued,     (e) => `student ${short(e.args[0] as string)} · revIdx ${e.args[2]}`);
        take("StudentRegistered", registered, (e) => `student ${short(e.args[0] as string)} registered`);
        take("CredentialRevoked", revoked,    (e) => `${short(e.args[0] as string)} revoked · reason: ${(e.args[2] as string).slice(0, 60)}`);
        take("ProposalCreated",   created,    (e) => `proposal #${e.args[0]} · ${proposalTypeLabel(Number(e.args[1]) as ProposalType)} · by ${short(e.args[2] as string)}`);
        take("ProposalExecuted",  executed,   (e) => `proposal #${e.args[0]} executed`);
        take("AccessGranted",     access,     (e) => `${short(e.args[0] as string)} → ${short(e.args[1] as string)}`);
        take("AccessRevoked",     accessRev,  (e) => `${short(e.args[0] as string)} revoked → ${short(e.args[1] as string)}`);

        out.sort((a, b) => b.block - a.block);
        setEvents(out);

        const proposalsList = await fetchAllProposals(registry);
        setProposals(proposalsList.sort((a, b) => Number(b.id - a.id)));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally { setLoad(false); }
    })();
  }, [registry]);

  const filtered = filter === "all" ? events : events.filter((e) => e.kind === filter);

  return (
    <div className="sd-page">
      <Link href="/" className="sd-back">← Back to explorer</Link>

      <div className="sd-page-header">
        <h1 className="sd-page-title">{name}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <AddressPill address={registry} />
          <a href={explorerAddress(registry)} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--accent)", fontSize: 12 }}>↗ Blockscout</a>
        </div>
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {loading && <div style={{ color: "var(--fg-4)", fontSize: 13 }}>Loading events…</div>}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Panelists */}
          <div className="sd-card">
            <div className="sd-card-head">
              <div className="sd-card-title">Panelists</div>
            </div>
            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {panelists.map((p, i) => (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--bg-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--fg-3)", fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                  <AddressPill address={p} head={6} tail={4} />
                </div>
              ))}
            </div>
          </div>

          {/* Proposals */}
          <div className="sd-card">
            <div className="sd-card-head">
              <div className="sd-card-title">Governance proposals</div>
              <span style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--fg-4)" }}>{proposals.length} total</span>
            </div>
            <div style={{ padding: "0 20px" }}>
              {proposals.length === 0 && (
                <div style={{ padding: "20px 0", fontSize: 13, color: "var(--fg-4)" }}>None yet.</div>
              )}
              {proposals.slice(0, 5).map((p, idx) => {
                const decoded = decodeProposalData(p.pType, p.data);
                const blurb = p.pType === ProposalType.Enrollment ? `enroll ${(decoded.commitment as string)?.slice(0, 14)}…`
                  : p.pType === ProposalType.Revocation ? `revoke ${short(decoded.student as string)}`
                  : `replace slot ${String(decoded.slot)} → ${short(decoded.newPanelist as string)}`;
                return (
                  <div key={p.id.toString()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)", fontSize: 12 }}>
                    <span style={{ color: "var(--fg-2)" }}>
                      <span style={{ color: "var(--fg-1)", fontWeight: 500 }}>#{p.id.toString()}</span>
                      {" · "}{proposalTypeLabel(p.pType)}
                      {" · "}<span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>{blurb}</span>
                    </span>
                    <span>
                      {p.executed
                        ? <span className="sd-pill sd-pill--executed"><span className="sd-pill__dot" />Executed</span>
                        : p.expiresAt * 1000 < Date.now()
                          ? <span className="sd-pill sd-pill--expired"><span className="sd-pill__dot" />Expired</span>
                          : <span className="sd-pill sd-pill--active"><span className="sd-pill__dot" />{p.approvals}/3</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Event feed */}
          <div className="sd-card">
            <div className="sd-card-head">
              <div className="sd-card-title">Events</div>
              <span style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--fg-4)" }}>{filtered.length} shown</span>
            </div>
            <div style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 6, borderBottom: "1px solid var(--border-subtle)" }}>
              {(["all", "DIDIssued", "StudentRegistered", "CredentialRevoked", "ProposalCreated", "ProposalExecuted", "AccessGranted", "AccessRevoked"] as const).map((k) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`sd-chip${filter === k ? " active" : ""}`}>
                  {k}
                </button>
              ))}
            </div>
            <div>
              {filtered.length === 0 && (
                <div style={{ padding: "20px", fontSize: 13, color: "var(--fg-4)" }}>No events.</div>
              )}
              {filtered.map((e, i) => (
                <div key={`${e.tx}-${i}`} className="sd-row" style={{ justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                    <span className={`sd-feed-type ${FEED_CLASS[e.kind]}`}>{e.kind}</span>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.summary}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--fg-4)", flexShrink: 0 }}>
                    <span>blk {e.block}</span>
                    <a href={explorerTx(e.tx)} target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--accent)" }}>↗</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function short(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "0x0";
}
