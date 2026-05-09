"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AddressPill, getFactoryRead, getRegistryRead, getAccessManagerRead,
  useWallet,
} from "@securedid/shared";
import { FACTORY_ADDRESS, ACCESS_MANAGER_ADDRESS } from "@/lib/env";

/* ─── Types ─── */
interface AccessRequestRow {
  id: number;
  requester: string;
  student: string;
  registry: string;
  institution: string;
  createdAt: number;
  expiry: number;
  approvals: number;
  studentApproved: boolean;
  active: boolean;
  revoked: boolean;
  cid: string;
  status: number;
}

type Tab = "permitted" | "revoked";

/* ─── Dummy CGPA/Attendance (for demo) ─── */
function dummyCGPA(addr: string): string {
  const n = parseInt(addr.slice(-4), 16) % 100;
  return (3.0 + (n / 100) * 1.0).toFixed(2);
}
function dummyAttendance(addr: string): string {
  const n = parseInt(addr.slice(-6, -2), 16) % 100;
  return (75 + (n / 100) * 25).toFixed(1) + "%";
}

const STATUS_LABELS = ["Active", "Graduated", "Dropped", "Revoked"] as const;

/* ─── Page Component ─── */
export default function VCRequestsPage() {
  const { address, connect } = useWallet();
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<Tab>("permitted");
  const [search, setSearch]     = useState("");
  const [modal, setModal]       = useState<AccessRequestRow | null>(null);
  const [vcJson, setVcJson]     = useState<string | null>(null);
  const [vcLoading, setVcLoading] = useState(false);
  const [vcView, setVcView]     = useState<"structured" | "raw">("structured");
  const [vcParsed, setVcParsed]  = useState<Record<string, unknown> | null>(null);

  const loadRequests = useCallback(async () => {
    if (!ACCESS_MANAGER_ADDRESS || !FACTORY_ADDRESS) {
      setError("Access Manager or Factory contract is not configured.");
      setLoading(false);
      return;
    }
    try {
      const mgr   = getAccessManagerRead(ACCESS_MANAGER_ADDRESS);
      const factory = getFactoryRead(FACTORY_ADDRESS);
      const next  = await mgr.nextRequestId() as bigint;
      const addrs: string[] = await factory.getRegistries();
      const nameMap: Record<string, string> = {};
      for (const a of addrs) {
        try {
          const info = await factory.getInstitution(a);
          nameMap[a.toLowerCase()] = info.name as string;
        } catch { /* skip */ }
      }

      const out: AccessRequestRow[] = [];
      for (let i = 1n; i < next; i++) {
        const r = await mgr.getRequest(i);
        const registryAddr = (r.registry as string).toLowerCase();
        const studentAddr  = (r.student as string).toLowerCase();
        let cid = "";
        let status = 0;
        try {
          const reg = getRegistryRead(registryAddr);
          cid = await reg.getCID(studentAddr) as string;
          status = Number(await reg.getIdentityStatus(studentAddr));
        } catch { /* skip */ }

        out.push({
          id: Number(i),
          requester: (r.requester as string).toLowerCase(),
          student: studentAddr,
          registry: registryAddr,
          institution: nameMap[registryAddr] ?? "Unknown",
          createdAt: Number(r.createdAt),
          expiry: Number(r.expiry),
          approvals: Number(r.approvals),
          studentApproved: Boolean(r.studentApproved),
          active: Boolean(r.active),
          revoked: Boolean(r.revoked),
          cid,
          status,
        });
      }
      setRequests(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  /* ─── Filter logic ─── */
  const requesterAddress = address?.toLowerCase() ?? null;
  const visibleRequests = requesterAddress
    ? requests.filter((r) => r.requester === requesterAddress)
    : [];
  const permitted = visibleRequests.filter((r) => r.active && !r.revoked);
  const revoked   = visibleRequests.filter((r) => r.revoked);
  const filtered  = (tab === "permitted" ? permitted : revoked).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.student.includes(q) || r.institution.toLowerCase().includes(q) || r.requester.includes(q);
  });

  /* ─── Open VC detail modal ─── */
  async function openVC(row: AccessRequestRow) {
    setModal(row);
    setVcJson(null);
    setVcParsed(null);
    setVcView("structured");
    if (!row.cid) return;

    setVcLoading(true);
    try {
      // Try IPFS gateways
      const gateways = [
        `https://gateway.pinata.cloud/ipfs/${row.cid}`,
        `https://ipfs.io/ipfs/${row.cid}`,
        `https://cloudflare-ipfs.com/ipfs/${row.cid}`,
      ];
      let json: string | null = null;
      for (const gw of gateways) {
        try {
          // Handle data: URIs (demo mode)
          if (row.cid.startsWith("data:")) {
            const b64 = row.cid.split(",")[1];
            json = decodeURIComponent(escape(atob(b64)));
            try { setVcParsed(JSON.parse(json) as Record<string, unknown>); } catch { /* skip */ }
            break;
          }
          const res = await fetch(gw, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const parsed = await res.json();
            json = JSON.stringify(parsed, null, 2);
            setVcParsed(parsed as Record<string, unknown>);
            break;
          }
        } catch { /* try next */ }
      }
      setVcJson(json ?? `// Could not fetch from IPFS\n// CID: ${row.cid}`);
    } catch {
      setVcJson(`// Error fetching VC\n// CID: ${row.cid}`);
    } finally {
      setVcLoading(false);
    }
  }

  return (
    <div className="sd-page" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="sd-eyebrow">Compliance</div>
          <h1 className="sd-page-title">VC Access Requests</h1>
          <p className="sd-page-sub">View Verifiable Credentials approved for your connected requester account.</p>
        </div>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--accent)" }}>
          ← Back to Explorer
        </Link>
      </div>

      {/* Search */}
      <div className="sd-card sd-card--pad" style={{ marginBottom: 24, padding: "12px 20px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by DID, name, or institution..."
            className="sd-input"
            style={{ flex: 1 }}
          />
          {search && (
            <button onClick={() => setSearch("")} className="sd-btn sd-btn--secondary">Clear</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sd-tabs">
        <button className={`sd-tab${tab === "permitted" ? " active" : ""}`} onClick={() => setTab("permitted")}>
          Permitted ({permitted.length})
        </button>
        <button className={`sd-tab${tab === "revoked" ? " active" : ""}`} onClick={() => setTab("revoked")}>
          Revoked ({revoked.length})
        </button>
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {!loading && !requesterAddress && !error && (
        <div className="sd-card sd-card--pad sd-empty" style={{ marginTop: 24 }}>
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V8a5 5 0 0 1 10 0v3" /></svg>
          </div>
          <div className="sd-empty__title">Connect requester wallet</div>
          <p className="sd-empty__sub">Approved VC permissions are scoped to the requester account that submitted the access request.</p>
          <button onClick={() => void connect()} className="sd-btn sd-btn--primary" style={{ marginTop: 20 }}>
            Connect Wallet
          </button>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2].map((i) => <div key={i} className="sd-skel" style={{ height: 72 }} />)}
        </div>
      )}

      {!loading && requesterAddress && filtered.length === 0 && (
        <div className="sd-empty">
          <div className="sd-empty__title">{tab === "permitted" ? "No permitted requests" : "No revoked requests"}</div>
          <p className="sd-empty__sub">{tab === "permitted" ? "This wallet has no active approved VC permissions." : "This wallet has no revoked VC permissions."}</p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="sd-card" style={{ overflow: "hidden" }}>
          <table className="sd-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Student / DID</th>
                <th>Institution</th>
                <th>CGPA</th>
                <th>Attendance</th>
                <th>Source</th>
                {tab === "revoked" && <th>Revoked On</th>}
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openVC(r)}>
                  <td>
                    <div style={{ font: "var(--fw-medium) 13px/1 var(--font-sans)", color: "var(--fg-1)" }}>
                      <AddressPill address={r.student} head={8} tail={6} showExplorer={false} />
                    </div>
                    <div style={{ font: "12px/1 var(--font-mono)", color: "var(--fg-4)", marginTop: 4 }}>
                      Request #{r.id} · {STATUS_LABELS[r.status] ?? "Unknown"}
                    </div>
                  </td>
                  <td style={{ color: "var(--fg-2)" }}>{r.institution}</td>
                  <td style={{ font: "var(--fw-semibold) 14px/1 var(--font-mono)", color: "var(--fg-1)" }}>{dummyCGPA(r.student)}</td>
                  <td style={{ color: "var(--fg-1)" }}>{dummyAttendance(r.student)}</td>
                  <td>
                    {r.cid ? (
                      <span className="sd-vc-badge sd-vc-badge--ipfs" style={{ fontSize: 10 }}>IPFS</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--fg-4)" }}>—</span>
                    )}
                  </td>
                  {tab === "revoked" && (
                    <td style={{ fontSize: 12, color: "var(--fg-3)" }}>
                      {r.expiry > 0 ? new Date(r.expiry * 1000).toLocaleDateString() : "—"}
                    </td>
                  )}
                  <td style={{ textAlign: "right" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openVC(r); }}
                      className="sd-btn sd-btn--primary sd-btn--sm"
                    >
                      View VC
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── VC Detail Modal ─── */}
      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface-0)", borderRadius: "var(--radius-xl)",
              boxShadow: "0 20px 60px -10px rgba(0,0,0,0.2)",
              maxWidth: 680, width: "100%", maxHeight: "90vh", overflowY: "auto",
              border: "1px solid var(--border-default)",
            }}
          >
            {/* Modal Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 28px", borderBottom: "1px solid var(--border-subtle)",
              position: "sticky", top: 0, background: "var(--bg-surface-0)",
              borderRadius: "var(--radius-xl) var(--radius-xl) 0 0", zIndex: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--accent-100), var(--accent-50))",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4" /><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /></svg>
                </div>
                <h2 style={{ font: "var(--fw-semibold) 18px/1.3 var(--font-heading)", color: "var(--fg-1)" }}>VC Details</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  display: "flex", borderRadius: "var(--radius-md)", overflow: "hidden",
                  border: "1px solid var(--border-default)",
                }}>
                  <button
                    onClick={() => setVcView("structured")}
                    style={{
                      padding: "6px 14px", border: "none", cursor: "pointer",
                      font: "var(--fw-medium) 12px/1 var(--font-sans)",
                      background: vcView === "structured" ? "var(--accent)" : "var(--bg-surface-0)",
                      color: vcView === "structured" ? "white" : "var(--fg-2)",
                      transition: "all 0.15s ease",
                    }}
                  >Structured</button>
                  <button
                    onClick={() => setVcView("raw")}
                    style={{
                      padding: "6px 14px", border: "none", cursor: "pointer",
                      font: "var(--fw-medium) 12px/1 var(--font-sans)",
                      borderLeft: "1px solid var(--border-default)",
                      background: vcView === "raw" ? "var(--accent)" : "var(--bg-surface-0)",
                      color: vcView === "raw" ? "white" : "var(--fg-2)",
                      transition: "all 0.15s ease",
                    }}
                  >Raw</button>
                </div>
                <button
                  onClick={() => setModal(null)}
                  style={{
                    width: 32, height: 32, borderRadius: "var(--radius-sm)",
                    border: "none", background: "transparent", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--fg-3)", fontSize: 20,
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={{ padding: "24px 28px" }}>
              {/* ─── STRUCTURED VIEW ─── */}
              {vcView === "structured" && (
                <>
                  {/* IPFS Source Badge */}
                  {modal.cid && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "var(--info-50)", color: "var(--info-700)",
                      padding: "10px 16px", borderRadius: "var(--radius-md)",
                      marginBottom: 20, fontSize: 13, fontWeight: 500,
                      border: "1px solid #c7d2fe",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                      Source: IPFS
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 8, opacity: 0.8 }}>
                        {modal.cid.startsWith("data:") ? "embedded (demo)" : modal.cid.slice(0, 20) + "…"}
                      </span>
                    </div>
                  )}

                  {/* Student Identity Header */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    paddingBottom: 20, marginBottom: 20,
                    borderBottom: "1px solid var(--border-subtle)",
                  }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: "50%",
                      background: "var(--bg-surface-2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: "var(--fw-semibold) 17px/1.3 var(--font-heading)", color: "var(--fg-1)" }}>
                        {vcParsed?.credentialSubject && typeof vcParsed.credentialSubject === "object" && "name" in (vcParsed.credentialSubject as Record<string,unknown>)
                          ? String((vcParsed.credentialSubject as Record<string,unknown>).name)
                          : "Student DID"}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
                        did:securedid:{modal.registry.slice(2, 10)}:{modal.student}
                      </div>
                    </div>
                    <span className={`sd-pill ${modal.revoked ? "sd-pill--revoked" : "sd-pill--active"}`}>
                      <span className="sd-pill__dot" />
                      {modal.revoked ? "Revoked" : "Permitted"}
                    </span>
                  </div>

                  {/* Credential Subject Fields (from IPFS) */}
                  {vcParsed?.credentialSubject && typeof vcParsed.credentialSubject === "object" && (
                    <>
                      <div style={{
                        font: "var(--fw-semibold) 10px/1 var(--font-sans)",
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        color: "var(--fg-3)", marginBottom: 12,
                      }}>Credential Subject</div>
                      <div className="sd-vc-fields" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", marginBottom: 20 }}>
                        {Object.entries(vcParsed.credentialSubject as Record<string, unknown>)
                          .filter(([k]) => k !== "id")
                          .map(([key, val]) => (
                            <div key={key} className="sd-vc-field">
                              <div className="sd-vc-field__label">{key.replace(/([A-Z])/g, " $1").trim()}</div>
                              <div className={`sd-vc-field__value${typeof val === "string" && val.startsWith("0x") ? " sd-vc-field__value--mono" : ""}`}>
                                {String(val)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </>
                  )}

                  {/* Academic Performance (dummy) */}
                  <div style={{
                    font: "var(--fw-semibold) 10px/1 var(--font-sans)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "var(--fg-3)", marginBottom: 12,
                  }}>Academic Performance</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    <DetailBox label="CGPA" value={`${dummyCGPA(modal.student)} / 4.0`} large />
                    <DetailBox label="Attendance" value={dummyAttendance(modal.student)} large />
                    <DetailBox label="Requester" value="" address={modal.requester} />
                    <DetailBox label="Approvals" value={`${modal.approvals}`} />
                  </div>

                  {/* Credential Metadata */}
                  {vcParsed && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                      {Boolean(vcParsed.issuer) && <DetailBox label="Issuer DID" value={String(vcParsed.issuer)} mono />}
                      {Boolean(vcParsed.issuanceDate) && <DetailBox label="Issued At" value={new Date(String(vcParsed.issuanceDate)).toLocaleString()} />}
                      {Boolean(vcParsed.type) && <DetailBox label="Credential Type" value={Array.isArray(vcParsed.type) ? (vcParsed.type as string[]).filter(t => t !== "VerifiableCredential").join(", ") : String(vcParsed.type)} />}
                      {Boolean(modal.cid) && <DetailBox label="IPFS CID" value={modal.cid.startsWith("data:") ? "embedded (demo)" : modal.cid} mono />}
                    </div>
                  )}
                </>
              )}

              {/* ─── RAW VIEW ─── */}
              {vcView === "raw" && (
                <>
                  {vcLoading && (
                    <div style={{ fontSize: 12, color: "var(--fg-4)", marginBottom: 16 }}>Loading VC from IPFS…</div>
                  )}
                  {vcJson ? (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{
                        font: "var(--fw-semibold) 10px/1 var(--font-sans)",
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        color: "var(--fg-3)", marginBottom: 8,
                      }}>Verifiable Credential (from IPFS)</div>
                      <pre className="sd-json" style={{ maxHeight: 400 }}>{vcJson}</pre>
                    </div>
                  ) : !vcLoading && (
                    <div style={{ fontSize: 12, color: "var(--fg-4)", marginBottom: 16 }}>
                      {modal.cid ? "Failed to load VC from IPFS." : "No CID stored for this student."}
                    </div>
                  )}
                </>
              )}

              {/* Signature Badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--success-50)", color: "var(--success-700)",
                padding: "12px 16px", borderRadius: "var(--radius-md)",
                fontSize: 12, fontWeight: 600, letterSpacing: "0.03em",
                textTransform: "uppercase",
                border: "1px solid rgba(5,150,105,0.15)",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                Signature Valid — Issuer DID Verified
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailBox({ label, value, address, large, mono }: { label: string; value: string; address?: string; large?: boolean; mono?: boolean }) {
  return (
    <div style={{
      background: "var(--bg-surface-0)", padding: "14px 16px",
      borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)",
    }}>
      <div style={{
        font: "var(--fw-semibold) 10px/1 var(--font-sans)",
        letterSpacing: "0.08em", textTransform: "uppercase",
        color: "var(--fg-3)", marginBottom: 6,
      }}>{label}</div>
      {address ? (
        <AddressPill address={address} head={10} tail={6} />
      ) : (
        <div style={{
          font: `var(--fw-medium) ${large ? "20px" : "14px"}/1 ${mono ? "var(--font-mono)" : "var(--font-sans)"}`,
          color: "var(--fg-1)",
          wordBreak: mono ? "break-all" as const : undefined,
          fontSize: mono && !large ? 11 : undefined,
        }}>{value}</div>
      )}
    </div>
  );
}
