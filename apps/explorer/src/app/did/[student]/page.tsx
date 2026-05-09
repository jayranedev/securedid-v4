"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import {
  AddressPill,
  getFactoryRead,
  getRegistryRead,
  explorerTx,
  queryFilterAll,
} from "@securedid/shared";
import { FACTORY_ADDRESS } from "@/lib/env";

const STATUS_LABELS = ["Active", "Graduated", "Dropped", "Revoked"] as const;

type EventKind =
  | "StudentRegistered"
  | "DIDIssued"
  | "CredentialRevoked"
  | "IdentityStatusUpdated"
  | "AccessGranted"
  | "AccessRevoked";

interface RegistrySummary {
  registry: string;
  name: string;
  status: number;
  pending: boolean;
  cid: string;
}

interface Entry {
  registry: string;
  registryName: string;
  kind: EventKind;
  block: number;
  tx: string;
  summary: string;
}

export default function DidPage() {
  const params = useParams<{ student: string }>();
  const student = (params.student ?? "").toLowerCase();

  const [summaries, setSummaries] = useState<RegistrySummary[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!FACTORY_ADDRESS) { setError("NEXT_PUBLIC_FACTORY_ADDRESS not configured"); setLoad(false); return; }
    if (!student || !ethers.isAddress(student)) { setError("Invalid student address"); setLoad(false); return; }

    (async () => {
      setLoad(true);
      setError(null);
      try {
        const factory = getFactoryRead(FACTORY_ADDRESS);
        const registries: string[] = await factory.getRegistries();
        const summaryOut: RegistrySummary[] = [];
        const entryOut: Entry[] = [];

        for (const addr of registries) {
          const regAddr = addr.toLowerCase();
          const reg = getRegistryRead(regAddr);
          let name = "Registry";
          let deployedAt: number | undefined;
          try {
            const info = await factory.getInstitution(regAddr);
            name = info.name as string;
            deployedAt = Number(info.deployedAt);
          } catch {
            // ignore
          }
          const fromBlock = deployedAt ? { fromTimestamp: deployedAt } : undefined;

          const [cid, pending, status] = await Promise.all([
            reg.getCID(student),
            reg.pendingRegistration(student),
            reg.getIdentityStatus(student),
          ]);

          const [registered, issued, revoked, statusEvents, accessGranted, accessRevoked] = await Promise.all([
            queryFilterAll(reg, reg.filters.StudentRegistered(student), fromBlock),
            queryFilterAll(reg, reg.filters.DIDIssued(student), fromBlock),
            queryFilterAll(reg, reg.filters.CredentialRevoked(student), fromBlock),
            queryFilterAll(reg, reg.filters.IdentityStatusUpdated(student), fromBlock),
            queryFilterAll(reg, reg.filters.AccessGranted(student, null), fromBlock),
            queryFilterAll(reg, reg.filters.AccessRevoked(student, null), fromBlock),
          ]);

          const cidStr = String(cid ?? "");
          const hasEvents = registered.length + issued.length + revoked.length + statusEvents.length + accessGranted.length + accessRevoked.length > 0;
          if (!hasEvents && !pending && !cidStr) continue;

          summaryOut.push({
            registry: regAddr,
            name,
            status: Number(status),
            pending: Boolean(pending),
            cid: cidStr,
          });

          const take = (kind: EventKind, list: ethers.EventLog[] | ethers.Log[], summary: (e: ethers.EventLog) => string) => {
            for (const raw of list) {
              const ev = raw as ethers.EventLog;
              entryOut.push({
                registry: regAddr,
                registryName: name,
                kind,
                block: ev.blockNumber,
                tx: ev.transactionHash,
                summary: summary(ev),
              });
            }
          };

          take("StudentRegistered", registered, (e) => `registered · commitment ${(e.args?.[1] as string)?.slice(0, 12)}…`);
          take("DIDIssued", issued, (e) => `DID issued · revIdx ${String(e.args?.[2])}`);
          take("CredentialRevoked", revoked, (e) => `revoked · reason: ${(e.args?.[2] as string).slice(0, 80)}`);
          take("IdentityStatusUpdated", statusEvents, (e) => `status → ${STATUS_LABELS[Number(e.args?.[1])] ?? "Unknown"}`);
          take("AccessGranted", accessGranted, (e) => `access granted → ${short(e.args?.[1] as string)}`);
          take("AccessRevoked", accessRevoked, (e) => `access revoked → ${short(e.args?.[1] as string)}`);
        }

        entryOut.sort((a, b) => b.block - a.block);
        setSummaries(summaryOut);
        setEntries(entryOut);

        if (summaryOut.length === 0) {
          setError("No DID records found for this student.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lookup failed");
      } finally { setLoad(false); }
    })();
  }, [student]);

  return (
    <div className="sd-page">
      <Link href="/" className="sd-back">← Back to explorer</Link>

      <div className="sd-page-header">
        <div className="sd-eyebrow">DID Timeline</div>
        <h1 className="sd-page-title">Student DID</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <AddressPill address={student} />
        </div>
      </div>

      {loading && <div style={{ color: "var(--fg-4)", fontSize: 13 }}>Loading DID activity…</div>}
      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {!loading && summaries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="sd-card sd-card--pad">
            <div className="sd-card-title">Registries</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              {summaries.map((r) => (
                <div key={r.registry} className="sd-row" style={{ justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 12, color: "var(--fg-3)" }}>{r.name}</div>
                    <AddressPill address={r.registry} />
                    {r.cid && (
                      <div style={{ fontSize: 12, color: "var(--fg-4)", wordBreak: "break-all" }}>CID: {r.cid}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-2)", textAlign: "right" }}>
                    <div>Status: <strong>{STATUS_LABELS[r.status] ?? "Unknown"}</strong></div>
                    {r.pending && <div style={{ color: "var(--warning-700, #b45309)" }}>Pending approval</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sd-card">
            <div className="sd-card-head">
              <div className="sd-card-title">Activity</div>
              <span style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--fg-4)" }}>{entries.length} events</span>
            </div>
            <div>
              {entries.length === 0 && (
                <div style={{ padding: "20px", fontSize: 13, color: "var(--fg-4)" }}>No events for this DID.</div>
              )}
              {entries.map((e, i) => (
                <div key={`${e.tx}-${i}`} className="sd-row" style={{ justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: "var(--fg-3)" }}>{e.registryName}</div>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.kind} · {e.summary}</span>
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
