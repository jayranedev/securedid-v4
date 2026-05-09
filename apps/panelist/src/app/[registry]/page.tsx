"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  useWallet, AddressPill, getRegistryRead, getRegistryWrite,
  fetchAllProposals, decodeProposalData, proposalTypeLabel, ProposalType,
  ProposalSummary, queryFilterAll, getAccessManagerRead, getAccessManagerWrite,
} from "@securedid/shared";
import { NewProposalModal } from "@/components/NewProposalModal";
import { BulkEnrollModal } from "@/components/BulkEnrollModal";
import { ACCESS_MANAGER_ADDRESS } from "@/lib/env";

type Tab = "proposals" | "students" | "records" | "access" | "panelists";

type RawRow = Record<string, unknown>;

interface CommitmentRow {
  commitment: string;
  name?: string;
  email?: string;
  roll?: string;
  department?: string;
  year?: string;
  secret?: string;
}

const COMMITMENT_HEADER_ALIASES: Record<string, keyof CommitmentRow> = {
  commitment: "commitment",
  commitmenthash: "commitment",
  commithash: "commitment",
  hash: "commitment",
  email: "email",
  mail: "email",
  roll: "roll",
  rollno: "roll",
  rollnumber: "roll",
  name: "name",
  studentname: "name",
  department: "department",
  dept: "department",
  year: "year",
  batch: "year",
  admissionyear: "year",
  secret: "secret",
};

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeCommitment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return `0x${trimmed.toLowerCase()}`;
  return trimmed.toLowerCase();
}

function normalizeCommitmentRow(row: RawRow): CommitmentRow {
  const out: CommitmentRow = { commitment: "" };
  for (const [key, value] of Object.entries(row)) {
    const mapped = COMMITMENT_HEADER_ALIASES[normalizeHeaderKey(key)];
    if (!mapped) continue;
    const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (!text) continue;
    if (mapped === "commitment") out.commitment = text;
    else if (mapped === "year") out.year = text;
    else out[mapped] = text;
  }
  out.commitment = normalizeCommitment(out.commitment);
  return out;
}

function parseCSV(source: string | File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(source, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          reject(new Error(results.errors[0].message));
          return;
        }
        resolve(results.data);
      },
      error: (err) => reject(err),
    });
  });
}

function parseExcel(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve([]);
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read the uploaded file"));
    reader.readAsArrayBuffer(file);
  });
}

function parseStudentFile(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (name.endsWith(".csv") || type === "text/csv") return parseCSV(file);
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel"
  ) {
    return parseExcel(file);
  }
  return Promise.reject(new Error("Unsupported file format. Upload CSV or Excel (.xlsx/.xls)."));
}

function buildCommitmentMap(rows: RawRow[]): {
  map: Record<string, CommitmentRow>;
  stats: { total: number; valid: number; invalid: number; duplicates: number };
} {
  const map: Record<string, CommitmentRow> = {};
  let invalid = 0;
  let duplicates = 0;
  for (const row of rows) {
    const normalized = normalizeCommitmentRow(row);
    const commitment = normalized.commitment;
    if (!commitment || !ethers.isHexString(commitment, 32)) {
      invalid++;
      continue;
    }
    if (map[commitment]) duplicates++;
    map[commitment] = normalized;
  }
  const total = rows.length;
  const valid = Object.keys(map).length;
  return { map, stats: { total, valid, invalid, duplicates } };
}

function formatStudentSummary(row: CommitmentRow): string {
  const parts = [row.name, row.roll, row.department, row.year].filter(Boolean);
  return parts.join(" · ");
}

const detailLabelStyle = {
  textTransform: "uppercase",
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: "0.05em",
  color: "var(--fg-4)",
  marginRight: 6,
} as const;

const STATUS_LABELS = ["Active", "Graduated", "Dropped", "Revoked"] as const;

export default function RegistryPage() {
  const params = useParams<{ registry: string }>();
  const registry = (params.registry ?? "").toLowerCase();
  const { address, getSigner } = useWallet();

  const [name, setName]             = useState<string>("");
  const [panelists, setPanelists]   = useState<string[]>([]);
  const [threshold, setThreshold]   = useState<number>(1);
  const [isPanelist, setIsPanelist] = useState(false);
  const [proposals, setProposals]   = useState<ProposalSummary[]>([]);
  const [deployedAt, setDeployedAt] = useState<number | undefined>();
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<Tab>("proposals");
  const [showModal, setShowModal]       = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [busy, setBusy]             = useState<string | null>(null);
  const [msg, setMsg]               = useState<string | null>(null);
  const [commitmentMap, setCommitmentMap] = useState<Record<string, CommitmentRow>>({});
  const [commitmentStats, setCommitmentStats] = useState<{ total: number; valid: number; invalid: number; duplicates: number } | null>(null);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);
  const [commitmentFileName, setCommitmentFileName] = useState<string | null>(null);
  const commitmentInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!registry) return;
    setLoading(true);
    try {
      const reg = getRegistryRead(registry);
      const [ps, thresh, proposalsList] = await Promise.all([
        reg.getPanelists() as Promise<string[]>,
        reg.threshold() as Promise<bigint>,
        fetchAllProposals(registry),
      ]);
      setPanelists(ps.map((p) => p.toLowerCase()));
      setThreshold(Number(thresh));
      if (address) setIsPanelist(await reg.isPanelist(address));
      const now = Date.now();
      const rank = (p: ProposalSummary) => (!p.executed && p.expiresAt * 1000 > now ? 0 : 1);
      setProposals(
        proposalsList.sort((a, b) => {
          const rankDiff = rank(a) - rank(b);
          if (rankDiff !== 0) return rankDiff;
          return Number(b.id - a.id);
        })
      );

      const factoryAddr = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
      if (factoryAddr) {
        try {
          const factory = new ethers.Contract(
            factoryAddr,
            ["function getInstitution(address) view returns (string,string,uint256,address)"],
            reg.runner,
          );
          const info = await factory.getInstitution(registry);
          setName(info[0] as string);
          setDeployedAt(Number(info[2]));
        } catch { /* ignore */ }
      }
    } finally { setLoading(false); }
  }, [registry, address]);

  useEffect(() => { refresh(); }, [refresh]);

  async function vote(proposalId: bigint) {
    setBusy(`vote-${proposalId}`); setMsg(null);
    try {
      const signer = await getSigner();
      const reg = await getRegistryWrite(registry, signer);
      const tx = await reg.approveProposal(proposalId);
      setMsg(`Voting — tx ${tx.hash.slice(0, 12)}…`);
      await tx.wait();
      setMsg("✓ Vote recorded");
      await refresh();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setMsg(`✗ ${err.split("\n")[0].slice(0, 200)}`);
    } finally { setBusy(null); }
  }

  const activeProposals = proposals.filter((p) => !p.executed && p.expiresAt * 1000 > Date.now());

  async function handleCommitmentFile(file: File) {
    setCommitmentError(null);
    setCommitmentFileName(file.name);
    try {
      const rows = await parseStudentFile(file);
      const result = buildCommitmentMap(rows);
      setCommitmentMap(result.map);
      setCommitmentStats(result.stats);
      if (result.stats.valid === 0) {
        setCommitmentError("No valid commitments found in the uploaded file.");
      }
    } catch (err) {
      setCommitmentError(err instanceof Error ? err.message : "Failed to parse the uploaded file.");
      setCommitmentMap({});
      setCommitmentStats(null);
    }
  }

  function clearCommitmentFile() {
    setCommitmentMap({});
    setCommitmentStats(null);
    setCommitmentError(null);
    setCommitmentFileName(null);
    if (commitmentInputRef.current) commitmentInputRef.current.value = "";
  }

  return (
    <div className="sd-page">
      <Link href="/" className="sd-back">← Back to registries</Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <h1 className="sd-page-title">{name || "Registry"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <AddressPill address={registry} />
            <span style={{ color: "var(--fg-4)", fontSize: 12 }}>
              · Threshold {threshold}-of-{panelists.length}
            </span>
            {isPanelist && <span className="sd-pill sd-pill--you">You are a panelist</span>}
          </div>
        </div>
        {isPanelist && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowBulkModal(true)} className="sd-btn sd-btn--secondary">⬆ Bulk enroll</button>
            <button onClick={() => setShowModal(true)} className="sd-btn sd-btn--primary">+ New Proposal</button>
          </div>
        )}
      </div>

      {msg && (
        <div className="sd-alert sd-alert--info" style={{ marginBottom: 16, fontFamily: "var(--font-mono)", fontSize: 12 }}>{msg}</div>
      )}

      {isPanelist && tab !== "panelists" && (
        <div className="sd-card sd-card--pad" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ font: "var(--fw-semibold) 14px/1 var(--font-sans)", color: "var(--fg-2)" }}>Commitment lookup file</div>
              <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 6 }}>
                Upload a CSV or Excel file with commitments. Stored only for this session.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => commitmentInputRef.current?.click()} className="sd-btn sd-btn--secondary">
                Upload CSV/Excel
              </button>
              {commitmentFileName && (
                <button type="button" onClick={clearCommitmentFile} className="sd-btn sd-btn--ghost">
                  Clear
                </button>
              )}
              <input
                ref={commitmentInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleCommitmentFile(f); }}
              />
            </div>
          </div>

          {commitmentFileName && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--fg-3)" }}>
              File: <span style={{ color: "var(--fg-2)" }}>{commitmentFileName}</span>
            </div>
          )}

          {commitmentStats && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-3)" }}>
              Rows: {commitmentStats.total} · Valid: {commitmentStats.valid} · Invalid: {commitmentStats.invalid}
              {commitmentStats.duplicates > 0 ? ` · Duplicates: ${commitmentStats.duplicates}` : ""}
            </div>
          )}

          {commitmentError && (
            <div className="sd-alert sd-alert--danger" style={{ marginTop: 10, fontSize: 12 }}>
              {commitmentError}
            </div>
          )}
        </div>
      )}

      <div className="sd-tabs">
        {([
          ["proposals", `Proposals${activeProposals.length ? ` (${activeProposals.length})` : ""}`],
          ["students",  "Pending Students"],
          ...(isPanelist ? ([ ["records", "Student Records"], ["access", "Access Requests"] ] as [Tab, string][]) : []),
          ["panelists", `Panelists (${panelists.length})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`sd-tab${tab === k ? " active" : ""}`}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: "var(--fg-4)", fontSize: 13, paddingTop: 20 }}>Loading…</div>}

      {!loading && tab === "proposals" && (
        <ProposalsList proposals={proposals} isPanelist={isPanelist} myAddr={address} threshold={threshold} onVote={vote} busy={busy} commitmentMap={commitmentMap} />
      )}
      {!loading && tab === "students" && (
        <PendingStudents registry={registry} isPanelist={isPanelist} threshold={threshold} onChange={refresh} deployedAt={deployedAt} institutionName={name} commitmentMap={commitmentMap} />
      )}
      {!loading && tab === "records" && isPanelist && (
        <StudentRecords registry={registry} deployedAt={deployedAt} />
      )}
      {!loading && tab === "access" && isPanelist && (
        <AccessRequests registry={registry} threshold={threshold} />
      )}
      {!loading && tab === "panelists" && (
        <PanelistList panelists={panelists} myAddr={address} threshold={threshold} />
      )}

      {showModal && isPanelist && (
        <NewProposalModal
          registry={registry}
          panelistCount={panelists.length}
          threshold={threshold}
          onClose={() => setShowModal(false)}
          onCreated={async () => { setShowModal(false); await refresh(); }}
        />
      )}

      {showBulkModal && isPanelist && (
        <BulkEnrollModal
          registry={registry}
          onClose={() => setShowBulkModal(false)}
          onDone={async () => { setShowBulkModal(false); await refresh(); }}
        />
      )}
    </div>
  );
}

function ProposalsList({ proposals, isPanelist, myAddr, threshold, onVote, busy, commitmentMap }: {
  proposals: ProposalSummary[]; isPanelist: boolean; myAddr: string | null;
  threshold: number;
  onVote: (id: bigint) => void; busy: string | null; commitmentMap: Record<string, CommitmentRow>;
}) {
  const { address } = useWallet();
  const [votesByProposal, setVotes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!address || proposals.length === 0) { setVotes({}); return; }
    const registryAddr = window.location.pathname.split("/")[1];
    (async () => {
      const entries: [string, boolean][] = [];
      for (const p of proposals) {
        const reg = getRegistryRead(registryAddr);
        const voted = await reg.hasVoted(p.id, address) as boolean;
        entries.push([p.id.toString(), voted]);
      }
      setVotes(Object.fromEntries(entries));
    })();
  }, [proposals, address]);

  if (proposals.length === 0) {
    return (
      <div className="sd-empty">
        <div className="sd-empty__title">No proposals yet</div>
        <p className="sd-empty__sub">Create the first proposal to start the governance process.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {proposals.map((p) => {
        const decoded = decodeProposalData(p.pType, p.data);
        const expired = p.expiresAt * 1000 < Date.now();
        const myVote  = votesByProposal[p.id.toString()];
        const statusCls = p.executed ? "sd-pill--executed" : expired ? "sd-pill--expired" : "sd-pill--active";
        const statusLabel = p.executed ? "Executed" : expired ? "Expired" : "Active";
        const commitmentValue = p.pType === ProposalType.Enrollment
          ? normalizeCommitment(String(decoded.commitment ?? ""))
          : "";
        const matchedRow = commitmentValue ? commitmentMap[commitmentValue] : undefined;
        return (
          <div key={p.id.toString()} className="sd-card sd-card--pad">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ font: "var(--fw-semibold) 15px/1 var(--font-sans)", color: "var(--fg-1)" }}>
                    #{p.id.toString()} · {proposalTypeLabel(p.pType)}
                  </span>
                  <span className={`sd-pill ${statusCls}`}><span className="sd-pill__dot" />{statusLabel}</span>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)", display: "flex", flexDirection: "column", gap: 4 }}>
                  {p.pType === ProposalType.Enrollment && (
                    <>
                      <div>commitment: <span style={{ color: "var(--fg-1)" }}>{(decoded.commitment as string)?.slice(0, 22)}…</span></div>
                      {matchedRow ? (
                        <div style={{ fontFamily: "var(--font-sans)", color: "var(--fg-2)", display: "grid", gap: 2 }}>
                          {matchedRow.name && <div><span style={detailLabelStyle}>Name</span>{matchedRow.name}</div>}
                          {matchedRow.roll && <div><span style={detailLabelStyle}>Roll</span>{matchedRow.roll}</div>}
                          {matchedRow.department && <div><span style={detailLabelStyle}>Dept</span>{matchedRow.department}</div>}
                          {matchedRow.year && <div><span style={detailLabelStyle}>Year</span>{matchedRow.year}</div>}
                          {matchedRow.email && <div><span style={detailLabelStyle}>Email</span>{matchedRow.email}</div>}
                        </div>
                      ) : (
                        <div style={{ fontFamily: "var(--font-sans)", color: "var(--fg-4)" }}>
                          student: Not found in uploaded file
                        </div>
                      )}
                    </>
                  )}
                  {p.pType === ProposalType.Revocation && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>student: <AddressPill address={decoded.student as string} head={10} tail={4} /></div>
                      <div>reason: <span style={{ fontFamily: "var(--font-sans)", color: "var(--fg-2)" }}>{decoded.reason as string}</span></div>
                    </>
                  )}
                  {p.pType === ProposalType.ReplacePanelist && (
                    <>
                      <div>slot: <span style={{ color: "var(--fg-1)" }}>{String(decoded.slot)}</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>new: <AddressPill address={decoded.newPanelist as string} head={10} tail={4} /></div>
                    </>
                  )}
                  {p.pType === ProposalType.ChangeThreshold && (
                    <div>new threshold: <span style={{ color: "var(--fg-1)", fontFamily: "var(--font-sans)" }}>{String(decoded.newThreshold)}</span></div>
                  )}
                  {p.pType === ProposalType.AddPanelist && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>add: <AddressPill address={decoded.newPanelist as string} head={10} tail={4} /></div>
                  )}
                  {p.pType === ProposalType.RemovePanelist && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>remove: <AddressPill address={decoded.panelistAddr as string} head={10} tail={4} /></div>
                  )}
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-4)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>proposer: <AddressPill address={p.proposer} head={6} tail={4} /></span>
                  <span>expires: {new Date(p.expiresAt * 1000).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ textAlign: "center", flexShrink: 0 }}>
                {p.executed ? (
                  <>
                    <div style={{ font: "var(--fw-regular) 28px/1 var(--font-sans)", color: "var(--success)" }}>✓</div>
                    <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--success-700)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>Done</div>
                  </>
                ) : (
                  <>
                    <div style={{ font: "var(--fw-regular) 36px/1 var(--font-heading)", color: "var(--fg-1)" }}>{p.approvals}</div>
                    <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>of {threshold}</div>
                  </>
                )}
              </div>
            </div>

            {!p.executed && (
              <div className="sd-progress" style={{ marginTop: 14 }}>
                <div className="sd-progress__fill"
                  style={{ width: `${Math.min(100, (p.approvals / threshold) * 100)}%` }} />
              </div>
            )}

            {isPanelist && !p.executed && !expired && !myVote && (
              <button onClick={() => onVote(p.id)} disabled={busy !== null}
                className="sd-btn sd-btn--primary" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
                {busy === `vote-${p.id}` ? "Submitting vote…" : "✓ Approve this proposal"}
              </button>
            )}
            {isPanelist && myVote && !p.executed && (
              <div style={{ marginTop: 12, fontSize: 12, textAlign: "center", color: "var(--fg-4)" }}>You&apos;ve already voted on this proposal.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface StudentDetails {
  name: string; email: string; roll: string; department: string; year: string;
}

function buildVC(student: string, registry: string, institutionName: string, details?: StudentDetails): string {
  const did = `did:securedid:${registry.slice(2, 10)}:${student}`;
  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "UniversityEnrollmentCredential"],
    id: did,
    issuer: `did:securedid:registry:${registry}`,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: did,
      studentAddress: student,
      institution: institutionName || registry,
      registryAddress: registry,
      enrolledAt: new Date().toISOString(),
      ...(details?.name       && { name:       details.name }),
      ...(details?.email      && { email:      details.email }),
      ...(details?.roll       && { rollNumber: details.roll }),
      ...(details?.department && { department: details.department }),
      ...(details?.year       && { year:       Number(details.year) }),
    },
  };
  return JSON.stringify(vc, null, 2);
}

async function uploadVC(vcJson: string, student: string): Promise<string> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (jwt) {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pinataContent: JSON.parse(vcJson), pinataMetadata: { name: `vc-${student.slice(0, 8)}` } }),
    });
    if (!res.ok) throw new Error(`Pinata error ${res.status}`);
    const { IpfsHash } = await res.json() as { IpfsHash: string };
    return IpfsHash;
  }
  return "data:application/json;base64," + btoa(unescape(encodeURIComponent(vcJson)));
}

function PendingStudents({ registry, isPanelist, threshold, onChange, deployedAt, institutionName, commitmentMap }: {
  registry: string; isPanelist: boolean; threshold: number; onChange: () => void; deployedAt?: number; institutionName: string;
  commitmentMap: Record<string, CommitmentRow>;
}) {
  const { getSigner } = useWallet();
  const [pending, setPending] = useState<{ student: string; approvals: number; commitment: string }[]>([]);
  const [loading, setLoad]    = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [cid, setCid]         = useState<Record<string, string>>({});
  const [issuing, setIssuing]   = useState<string | null>(null);
  const [details, setDetails]   = useState<Record<string, StudentDetails>>({});

  function setDetail(student: string, field: keyof StudentDetails, value: string) {
    setDetails((prev) => ({ ...prev, [student]: { ...prev[student], [field]: value } }));
  }

  useEffect(() => {
    (async () => {
      setLoad(true);
      try {
        const reg = getRegistryRead(registry);
        const fromBlock = deployedAt ? { fromTimestamp: deployedAt } : undefined;
        const events = await queryFilterAll(reg, reg.filters.StudentRegistered(), fromBlock);
        const seen = new Set<string>();
        const out: { student: string; approvals: number; commitment: string }[] = [];
        for (const e of events) {
          const ev = e as ethers.EventLog;
          const student = ((ev.args?.[0] ?? ev.args?.student) as string).toLowerCase();
          const commitment = normalizeCommitment(String(ev.args?.[1] ?? ev.args?.commitment ?? ""));
          if (seen.has(student)) continue;
          seen.add(student);
          const isPending = await reg.pendingRegistration(student);
          if (isPending) {
            const n = await reg.approvalCount(student);
            out.push({ student, approvals: Number(n), commitment });
          }
        }
        setPending(out);
      } finally { setLoad(false); }
    })();
  }, [registry, deployedAt]);

  useEffect(() => {
    if (!pending.length) return;
    setDetails((prev) => {
      let changed = false;
      const next: Record<string, StudentDetails> = { ...prev };
      for (const entry of pending) {
        const row = commitmentMap[normalizeCommitment(entry.commitment)];
        if (!row) continue;
        const existing = next[entry.student] ?? { name: "", email: "", roll: "", department: "", year: "" };
        const updated: StudentDetails = {
          name: existing.name || row.name || "",
          email: existing.email || row.email || "",
          roll: existing.roll || row.roll || "",
          department: existing.department || row.department || "",
          year: existing.year || row.year || "",
        };
        if (!next[entry.student] || JSON.stringify(existing) !== JSON.stringify(updated)) {
          next[entry.student] = updated;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pending, commitmentMap]);

  async function issueVC(student: string) {
    setIssuing(student);
    try {
      const vcJson = buildVC(student, registry, institutionName, details[student]);
      const resultCid = await uploadVC(vcJson, student);
      setCid((prev) => ({ ...prev, [student]: resultCid }));
    } catch (e) {
      alert(`Issue VC failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setIssuing(null); }
  }

  async function approve(student: string, approvals: number) {
    const isFinal = approvals >= threshold - 1;
    const studentCid = cid[student] || "";
    if (isFinal && !studentCid) { alert("This is the final approval — click Issue VC first to generate the credential"); return; }
    setBusy(student);
    try {
      const signer = await getSigner();
      const reg = await getRegistryWrite(registry, signer);
      const tx = await reg.approveStudent(student, studentCid);
      await tx.wait();
      onChange();
      setPending((p) => p.filter((x) => x.student !== student));
    } catch (e) {
      alert(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally { setBusy(null); }
  }

  if (loading) return <div style={{ color: "var(--fg-4)", fontSize: 13, paddingTop: 16 }}>Loading pending registrations…</div>;

  if (pending.length === 0) {
    return (
      <div className="sd-empty">
        <div className="sd-empty__title">No pending students</div>
        <p className="sd-empty__sub">All registration requests have been processed.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {pending.map(({ student, approvals, commitment }) => {
        const matchedRow = commitmentMap[normalizeCommitment(commitment)];
        return (
        <div key={student} className="sd-card sd-card--pad">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--fg-2)", marginBottom: 8 }}>Pending student</div>
              <AddressPill address={student} />
              {commitment && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
                  commitment: <span style={{ color: "var(--fg-3)" }}>{commitment.slice(0, 18)}…</span>
                </div>
              )}
              {matchedRow ? (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--fg-2)", display: "grid", gap: 2 }}>
                  {matchedRow.name && <div><span style={detailLabelStyle}>Name</span>{matchedRow.name}</div>}
                  {matchedRow.roll && <div><span style={detailLabelStyle}>Roll</span>{matchedRow.roll}</div>}
                  {matchedRow.department && <div><span style={detailLabelStyle}>Dept</span>{matchedRow.department}</div>}
                  {matchedRow.year && <div><span style={detailLabelStyle}>Year</span>{matchedRow.year}</div>}
                  {matchedRow.email && <div><span style={detailLabelStyle}>Email</span>{matchedRow.email}</div>}
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--fg-4)" }}>
                  student: Not found in uploaded file
                </div>
              )}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ font: "var(--fw-regular) 32px/1 var(--font-display)", color: "var(--fg-1)" }}>{approvals}</div>
              <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>of {threshold}</div>
            </div>
          </div>

          {isPanelist && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {approvals >= threshold - 1 ? (
                <>
                  <div style={{ fontSize: 12, color: "var(--accent-700, #3730a3)", fontWeight: 500 }}>
                    You are the final approver — fill student details, issue the VC, then approve.
                  </div>
                  {matchedRow && (
                    <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
                      Auto-filled from the uploaded commitment file.
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {([
                      ["name",       "Full name",   "Jane Doe"],
                      ["email",      "Email",       "student@college.edu"],
                      ["roll",       "Roll number", "CS2024-001"],
                      ["department", "Department",  "Computer Engineering"],
                      ["year",       "Year",        "2024"],
                    ] as [keyof StudentDetails, string, string][]).map(([field, label, placeholder]) => (
                      <div key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 11, color: "var(--fg-3)", fontWeight: 500 }}>{label}</label>
                        <input
                          value={details[student]?.[field] ?? ""}
                          onChange={(e) => setDetail(student, field, e.target.value)}
                          placeholder={placeholder}
                          className="sd-input"
                          style={{ fontSize: 12 }}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => issueVC(student)} disabled={issuing !== null || busy !== null}
                      className="sd-btn sd-btn--secondary" style={{ whiteSpace: "nowrap" }}>
                      {issuing === student ? "Building VC…" : "⚙ Issue VC"}
                    </button>
                    <input type="text" value={cid[student] ?? ""} onChange={(e) => setCid({ ...cid, [student]: e.target.value })}
                      placeholder="CID auto-filled after Issue VC"
                      className="sd-input sd-input--mono" style={{ flex: 1, fontSize: 11 }} />
                    <button onClick={() => approve(student, approvals)} disabled={busy !== null || !cid[student]}
                      className="sd-btn sd-btn--primary">
                      {busy === student ? "Approving…" : "Approve"}
                    </button>
                  </div>
                  {cid[student] && (
                    <div style={{ fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                      {cid[student].startsWith("data:") ? "✓ VC embedded (demo mode)" : `✓ IPFS: ${cid[student]}`}
                    </div>
                  )}
                </>
              ) : (
                <button onClick={() => approve(student, approvals)} disabled={busy !== null}
                  className="sd-btn sd-btn--primary" style={{ alignSelf: "flex-start" }}>
                  {busy === student ? "Approving…" : "✓ Approve"}
                </button>
              )}
            </div>
          )}
        </div>
      );
      })}
    </div>
  );
}

interface StudentRecordRow {
  student: string;
  status: number;
  cid: string;
}

function StudentRecords({ registry, deployedAt }: { registry: string; deployedAt?: number }) {
  const { getSigner } = useWallet();
  const [records, setRecords] = useState<StudentRecordRow[]>([]);
  const [loading, setLoad] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<Record<string, number>>({});

  async function refresh() {
    setLoad(true);
    setError(null);
    try {
      const reg = getRegistryRead(registry);
      const fromBlock = deployedAt ? { fromTimestamp: deployedAt } : undefined;
      const events = await queryFilterAll(reg, reg.filters.DIDIssued(), fromBlock);
      const students = Array.from(new Set(events.map((e) => ((e as ethers.EventLog).args?.[0] as string).toLowerCase())));
      const rows = await Promise.all(students.map(async (student) => {
        const [status, cid] = await Promise.all([
          reg.getIdentityStatus(student),
          reg.getCID(student),
        ]);
        return {
          student,
          status: Number(status),
          cid: String(cid ?? ""),
        } as StudentRecordRow;
      }));
      setRecords(rows);
      setStatusDraft(Object.fromEntries(rows.map((r) => [r.student, r.status])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load records");
    } finally { setLoad(false); }
  }

  useEffect(() => { void refresh(); }, [registry, deployedAt]);

  async function updateStatus(student: string) {
    const nextStatus = statusDraft[student];
    if (nextStatus === undefined || nextStatus === 3) return;
    setBusy(`status-${student}`);
    try {
      const signer = await getSigner();
      const regW = await getRegistryWrite(registry, signer);
      const tx = await regW.updateStatus(student, nextStatus);
      await tx.wait();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Update failed");
    } finally { setBusy(null); }
  }

  async function reactivate(student: string) {
    setBusy(`reactivate-${student}`);
    try {
      const signer = await getSigner();
      const regW = await getRegistryWrite(registry, signer);
      const tx = await regW.reactivateIdentity(student);
      await tx.wait();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Reactivate failed");
    } finally { setBusy(null); }
  }

  if (loading) return <div style={{ color: "var(--fg-4)", fontSize: 13, paddingTop: 16 }}>Loading student records…</div>;

  if (records.length === 0) {
    return (
      <div className="sd-empty">
        <div className="sd-empty__title">No issued students</div>
        <p className="sd-empty__sub">No students have completed enrollment yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <div className="sd-alert sd-alert--danger" style={{ fontSize: 12 }}>{error}</div>}
      {records.map((r) => {
        const isRevoked = r.status === 3;
        const isActive = r.status === 0;
        return (
          <div key={r.student} className="sd-card sd-card--pad">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--fg-2)", marginBottom: 6 }}>Student</div>
                <AddressPill address={r.student} />
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
                Status: <strong>{STATUS_LABELS[r.status] ?? "Unknown"}</strong>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {!isRevoked && (
                <select
                  value={statusDraft[r.student] ?? r.status}
                  onChange={(e) => setStatusDraft({ ...statusDraft, [r.student]: Number(e.target.value) })}
                  className="sd-input"
                  style={{ fontSize: 12, padding: "6px 10px", minWidth: 160 }}
                >
                  <option value={0}>Active</option>
                  <option value={1}>Graduated</option>
                  <option value={2}>Dropped</option>
                </select>
              )}
              {!isRevoked && (
                <button
                  onClick={() => updateStatus(r.student)}
                  disabled={busy !== null || (statusDraft[r.student] ?? r.status) === r.status}
                  className="sd-btn sd-btn--secondary"
                >
                  {busy === `status-${r.student}` ? "Updating…" : "Update status"}
                </button>
              )}
              {!isActive && (
                <button
                  onClick={() => reactivate(r.student)}
                  disabled={busy !== null}
                  className="sd-btn sd-btn--primary"
                >
                  {busy === `reactivate-${r.student}` ? "Reactivating…" : "Reactivate"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface AccessRequestRow {
  id: number;
  requester: string;
  student: string;
  registry: string;
  createdAt: number;
  expiry: number;
  approvals: number;
  studentApproved: boolean;
  active: boolean;
  revoked: boolean;
  approvedByMe: boolean;
}

function AccessRequests({ registry, threshold }: { registry: string; threshold: number }) {
  const { address, getSigner } = useWallet();
  const [rows, setRows] = useState<AccessRequestRow[]>([]);
  const [loading, setLoad] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!ACCESS_MANAGER_ADDRESS) return;
    setLoad(true);
    setError(null);
    try {
      const mgr = getAccessManagerRead(ACCESS_MANAGER_ADDRESS);
      const next = await mgr.nextRequestId() as bigint;
      const out: AccessRequestRow[] = [];
      for (let i = 1n; i < next; i++) {
        const r = await mgr.getRequest(i);
        const row: AccessRequestRow = {
          id: Number(i),
          requester: (r.requester as string).toLowerCase(),
          student: (r.student as string).toLowerCase(),
          registry: (r.registry as string).toLowerCase(),
          createdAt: Number(r.createdAt),
          expiry: Number(r.expiry),
          approvals: Number(r.approvals),
          studentApproved: Boolean(r.studentApproved),
          active: Boolean(r.active),
          revoked: Boolean(r.revoked),
          approvedByMe: address ? await mgr.hasUniversityApproved(i, address) : false,
        };
        if (row.registry === registry.toLowerCase()) out.push(row);
      }
      setRows(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally { setLoad(false); }
  }

  useEffect(() => { void refresh(); }, [registry, address]);

  async function approve(id: number) {
    if (!ACCESS_MANAGER_ADDRESS) return;
    setBusy(id);
    try {
      const signer = await getSigner();
      const mgr = await getAccessManagerWrite(ACCESS_MANAGER_ADDRESS, signer);
      const tx = await mgr.approveByUniversity(id);
      await tx.wait();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Approval failed");
    } finally { setBusy(null); }
  }

  if (!ACCESS_MANAGER_ADDRESS) {
    return (
      <div className="sd-card sd-card--pad">
        <div className="sd-card-title">Access requests</div>
        <div className="sd-card-sub" style={{ marginTop: 6 }}>Access manager is not configured.</div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ color: "var(--fg-4)", fontSize: 13, paddingTop: 16 }}>Loading access requests…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="sd-empty">
        <div className="sd-empty__title">No access requests</div>
        <p className="sd-empty__sub">No third-party verification requests yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <div className="sd-alert sd-alert--danger" style={{ fontSize: 12 }}>{error}</div>}
      {rows.map((r) => {
        const expired = r.expiry > 0 && r.expiry * 1000 < Date.now();
        const status = r.revoked ? "Revoked" : r.active ? "Active" : expired ? "Expired" : r.studentApproved ? "Awaiting university" : "Waiting for student";
        const canApprove = !r.approvedByMe && !r.revoked && !expired && r.studentApproved;
        return (
          <div key={r.id} className="sd-card sd-card--pad">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--fg-2)" }}>Request #{r.id}</div>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg-3)" }}>
                  <div>Requester: <AddressPill address={r.requester} /></div>
                  <div>Student: <AddressPill address={r.student} /></div>
                  <div>Status: <strong>{status}</strong></div>
                  {r.expiry > 0 && <div>Expires: {new Date(r.expiry * 1000).toLocaleDateString()}</div>}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ font: "var(--fw-regular) 32px/1 var(--font-display)", color: "var(--fg-1)" }}>{r.approvals}</div>
                <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>of {threshold}</div>
              </div>
            </div>

            {canApprove && (
              <button onClick={() => approve(r.id)} disabled={busy !== null}
                className="sd-btn sd-btn--primary" style={{ marginTop: 12, width: "100%", justifyContent: "center" }}>
                {busy === r.id ? "Submitting…" : "Approve request"}
              </button>
            )}
            {r.approvedByMe && !r.active && !r.revoked && !expired && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--fg-4)", textAlign: "center" }}>
                You&apos;ve approved. Waiting for other panelists.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PanelistList({ panelists, myAddr, threshold }: { panelists: string[]; myAddr: string | null; threshold: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sd-alert sd-alert--info" style={{ fontSize: 12 }}>
        Current threshold: <strong>{threshold}-of-{panelists.length}</strong> — proposals execute when {threshold} panelist{threshold !== 1 ? "s" : ""} approve.
      </div>
      <div className="sd-card" style={{ overflow: "hidden" }}>
        {panelists.map((p, i) => (
          <div key={p} className="sd-row">
            <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: "50%", background: "var(--bg-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>{i + 1}</span>
            <div style={{ flex: 1 }}><AddressPill address={p} head={10} tail={6} /></div>
            {myAddr && p === myAddr.toLowerCase() && <span className="sd-pill sd-pill--you">YOU</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
