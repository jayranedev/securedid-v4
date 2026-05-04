"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import {
  useWallet, AddressPill, getRegistryRead, getRegistryWrite,
  fetchAllProposals, decodeProposalData, proposalTypeLabel, ProposalType,
  ProposalSummary, explorerTx, queryFilterAll,
} from "@securedid/shared";
import { NewProposalModal } from "@/components/NewProposalModal";
import { BulkEnrollModal } from "@/components/BulkEnrollModal";

type Tab = "proposals" | "students" | "panelists";

export default function RegistryPage() {
  const params = useParams<{ registry: string }>();
  const registry = (params.registry ?? "").toLowerCase();
  const { address, getSigner } = useWallet();

  const [name, setName]             = useState<string>("");
  const [panelists, setPanelists]   = useState<string[]>([]);
  const [isPanelist, setIsPanelist] = useState(false);
  const [proposals, setProposals]   = useState<ProposalSummary[]>([]);
  const [deployedAt, setDeployedAt] = useState<number | undefined>();
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<Tab>("proposals");
  const [showModal, setShowModal]       = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [busy, setBusy]             = useState<string | null>(null);
  const [msg, setMsg]               = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!registry) return;
    setLoading(true);
    try {
      const reg = getRegistryRead(registry);
      const [ps, proposalsList] = await Promise.all([
        reg.getPanelists() as Promise<string[]>,
        fetchAllProposals(registry),
      ]);
      setPanelists(ps.map((p) => p.toLowerCase()));
      if (address) setIsPanelist(await reg.isPanelist(address));
      setProposals(proposalsList.sort((a, b) => Number(b.id - a.id)));

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

  return (
    <div className="sd-page">
      <Link href="/" className="sd-back">← Back to registries</Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <h1 className="sd-page-title">{name || "Registry"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <AddressPill address={registry} />
            <span style={{ color: "var(--fg-4)", fontSize: 12 }}>· Threshold 3-of-5</span>
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

      <div className="sd-tabs">
        {([
          ["proposals", `Proposals${activeProposals.length ? ` (${activeProposals.length})` : ""}`],
          ["students",  "Pending Students"],
          ["panelists", "Panelists"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`sd-tab${tab === k ? " active" : ""}`}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: "var(--fg-4)", fontSize: 13, paddingTop: 20 }}>Loading…</div>}

      {!loading && tab === "proposals" && (
        <ProposalsList proposals={proposals} isPanelist={isPanelist} myAddr={address} onVote={vote} busy={busy} />
      )}
      {!loading && tab === "students" && (
        <PendingStudents registry={registry} isPanelist={isPanelist} onChange={refresh} deployedAt={deployedAt} institutionName={name} />
      )}
      {!loading && tab === "panelists" && (
        <PanelistList panelists={panelists} myAddr={address} />
      )}

      {showModal && isPanelist && (
        <NewProposalModal
          registry={registry}
          panelistCount={panelists.length}
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

function ProposalsList({ proposals, isPanelist, myAddr, onVote, busy }: {
  proposals: ProposalSummary[]; isPanelist: boolean; myAddr: string | null;
  onVote: (id: bigint) => void; busy: string | null;
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
        <p className="sd-empty__sub">Create the first proposal to start the 3-of-5 governance process.</p>
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
                    <div>commitment: <span style={{ color: "var(--fg-1)" }}>{(decoded.commitment as string)?.slice(0, 22)}…</span></div>
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
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-4)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>proposer: <AddressPill address={p.proposer} head={6} tail={4} /></span>
                  <span>expires: {new Date(p.expiresAt * 1000).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ font: "var(--fw-regular) 36px/1 var(--font-display)", color: "var(--fg-1)" }}>{p.approvals}</div>
                <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>of 3</div>
              </div>
            </div>

            <div className="sd-progress" style={{ marginTop: 14 }}>
              <div className={`sd-progress__fill${p.executed ? " sd-progress--success" : ""}`}
                style={{ width: `${Math.min(100, (p.approvals / 3) * 100)}%` }} />
            </div>

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
  // No Pinata configured — store as base64 data URI directly on-chain (demo mode)
  return "data:application/json;base64," + btoa(unescape(encodeURIComponent(vcJson)));
}

function PendingStudents({ registry, isPanelist, onChange, deployedAt, institutionName }: {
  registry: string; isPanelist: boolean; onChange: () => void; deployedAt?: number; institutionName: string;
}) {
  const { getSigner } = useWallet();
  const [pending, setPending] = useState<{ student: string; approvals: number }[]>([]);
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
        const out: { student: string; approvals: number }[] = [];
        for (const e of events) {
          const ev = e as ethers.EventLog;
          const student = ((ev.args?.[0] ?? ev.args?.student) as string).toLowerCase();
          if (seen.has(student)) continue;
          seen.add(student);
          const isPending = await reg.pendingRegistration(student);
          if (isPending) {
            const n = await reg.approvalCount(student);
            out.push({ student, approvals: Number(n) });
          }
        }
        setPending(out);
      } finally { setLoad(false); }
    })();
  }, [registry, deployedAt]);

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
    const isFinal = approvals >= 2; // this vote will be the 3rd → triggers DID issuance
    const studentCid = cid[student] || "";
    if (isFinal && !studentCid) { alert("This is the final approval — click Issue VC first to generate the credential"); return; }
    setBusy(student);
    try {
      const signer = await getSigner();
      const reg = await getRegistryWrite(registry, signer);
      const tx = await reg.approveStudent(student, studentCid); // empty string for non-final approvals
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
      {pending.map(({ student, approvals }) => (
        <div key={student} className="sd-card sd-card--pad">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--fg-2)", marginBottom: 8 }}>Pending student</div>
              <AddressPill address={student} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ font: "var(--fw-regular) 32px/1 var(--font-display)", color: "var(--fg-1)" }}>{approvals}</div>
              <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>of 3</div>
            </div>
          </div>

          {isPanelist && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {approvals >= 2 ? (
                // Final approver — fill student details + issue VC first
                <>
                  <div style={{ fontSize: 12, color: "var(--accent-700, #3730a3)", fontWeight: 500 }}>
                    You are the final approver — fill student details, issue the VC, then approve.
                  </div>

                  {/* Student detail fields */}
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
                // Early approver — just vote, no VC needed
                <button onClick={() => approve(student, approvals)} disabled={busy !== null}
                  className="sd-btn sd-btn--primary" style={{ alignSelf: "flex-start" }}>
                  {busy === student ? "Approving…" : "✓ Approve"}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PanelistList({ panelists, myAddr }: { panelists: string[]; myAddr: string | null }) {
  return (
    <div className="sd-card" style={{ overflow: "hidden" }}>
      {panelists.map((p, i) => (
        <div key={p} className="sd-row">
          <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: "50%", background: "var(--bg-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>{i + 1}</span>
          <div style={{ flex: 1 }}><AddressPill address={p} head={10} tail={6} /></div>
          {myAddr && p === myAddr.toLowerCase() && <span className="sd-pill sd-pill--you">YOU</span>}
        </div>
      ))}
    </div>
  );
}
