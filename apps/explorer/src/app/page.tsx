"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import {
  AddressPill, getFactoryRead, getRegistryRead, explorerAddress, explorerTx, EXPLORER_URL,
  queryFilterAll, useWallet, getAccessManagerWrite, getAccessManagerRead,
} from "@securedid/shared";
import { FACTORY_ADDRESS, ACCESS_MANAGER_ADDRESS } from "@/lib/env";

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

const STATUS_LABELS = ["Active", "Graduated", "Dropped", "Revoked"] as const;

interface StudentLookup {
  student: string;
  registry: string;
  institution: string;
  status: number;
  cid: string;
  pending: boolean;
}

type AccessFilter = "all" | "active" | "pending" | "awaiting" | "expired" | "revoked";

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
}

export default function Home() {
  const [rows, setRows]    = useState<Stats[]>([]);
  const [loading, setLoad] = useState(true);
  const [error, setError]  = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { address, connect, getSigner } = useWallet();
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResult, setStudentResult] = useState<StudentLookup | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [requestMsg, setRequestMsg] = useState<string | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>("all");

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
  const rawSearch = search.trim();
  const normalizedSearch = rawSearch.toLowerCase();
  const isTxHash = /^0x[a-fA-F0-9]{64}$/.test(rawSearch);
  const isBlockNumber = /^\d+$/.test(rawSearch);
  const isAddress = rawSearch.length > 0 && ethers.isAddress(rawSearch);
  const registryMatch = isAddress ? rows.find((r) => r.registry === normalizedSearch) : undefined;
  const shouldFilterList = normalizedSearch.length > 0 && !isTxHash && !isBlockNumber && (!isAddress || !!registryMatch);
  const filteredRows = shouldFilterList
    ? rows.filter((r) => [r.name, r.website, r.registry, r.owner]
      .some((v) => v.toLowerCase().includes(normalizedSearch)))
    : rows;
  const directTarget = isTxHash
    ? { label: "Open transaction", href: explorerTx(rawSearch) }
    : isBlockNumber
      ? { label: `Open block ${rawSearch}`, href: `${EXPLORER_URL}/block/${rawSearch}` }
      : null;
  const didTarget = isAddress ? { label: "View DID", href: `/did/${normalizedSearch}` } : null;
  const addressExplorerTarget = isAddress ? { label: "Open in explorer", href: explorerAddress(rawSearch) } : null;
  const showNoResults = !loading && rows.length > 0 && filteredRows.length === 0 && normalizedSearch.length > 0 && !directTarget && !didTarget;

  function openRegistry() {
    if (!registryMatch) return;
    router.push(`/${registryMatch.registry}`);
  }

  function openDirectTarget() {
    if (!directTarget) return;
    window.open(directTarget.href, "_blank", "noopener,noreferrer");
  }

  function openDidTarget() {
    if (!didTarget) return;
    router.push(didTarget.href);
  }

  async function loadAccessRequests() {
    if (!ACCESS_MANAGER_ADDRESS) return;
    setAccessLoading(true);
    setAccessError(null);
    try {
      const mgr = getAccessManagerRead(ACCESS_MANAGER_ADDRESS);
      const next = await mgr.nextRequestId() as bigint;
      const out: AccessRequestRow[] = [];
      for (let i = 1n; i < next; i++) {
        const r = await mgr.getRequest(i);
        out.push({
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
        });
      }
      setAccessRequests(out);
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : "Failed to load access requests");
    } finally { setAccessLoading(false); }
  }

  useEffect(() => { void loadAccessRequests(); }, [rows]);

  async function lookupStudent() {
    const trimmed = studentQuery.trim();
    setStudentError(null);
    setStudentResult(null);
    setRequestMsg(null);
    if (!ethers.isAddress(trimmed)) {
      setStudentError("Enter a valid student wallet address.");
      return;
    }
    if (rows.length === 0) {
      setStudentError("No registries loaded yet.");
      return;
    }
    setStudentLoading(true);
    try {
      for (const r of rows) {
        const reg = getRegistryRead(r.registry);
        const [cid, pending, status] = await Promise.all([
          reg.getCID(trimmed),
          reg.pendingRegistration(trimmed),
          reg.getIdentityStatus(trimmed),
        ]);
        const cidStr = String(cid ?? "");
        const isPending = Boolean(pending);
        if (cidStr.length > 0 || isPending) {
          setStudentResult({
            student: trimmed.toLowerCase(),
            registry: r.registry,
            institution: r.name,
            status: Number(status),
            cid: cidStr,
            pending: isPending,
          });
          return;
        }
      }
      setStudentError("No DID found for this student in any registry.");
    } catch (err) {
      setStudentError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setStudentLoading(false);
    }
  }

  async function requestAccess() {
    if (!studentResult) return;
    if (!ACCESS_MANAGER_ADDRESS) {
      setRequestMsg("Access manager address is not configured.");
      return;
    }
    if (!address) {
      await connect();
      return;
    }
    setRequestMsg(null);
    try {
      const signer = await getSigner();
      const mgr = await getAccessManagerWrite(ACCESS_MANAGER_ADDRESS, signer);
      const tx = await mgr.createRequest(studentResult.registry, studentResult.student);
      setRequestMsg(`Request sent - ${tx.hash.slice(0, 12)}...`);
      await tx.wait();
      setRequestMsg("✓ Access request submitted");
    } catch (err) {
      setRequestMsg(`✗ ${err instanceof Error ? err.message.split("\n")[0] : "Request failed"}`);
    }
  }

  return (
    <div className="sd-page" style={{ maxWidth: 1200 }}>
      {/* ─── Hero Section ─── */}
      <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center", marginBottom: 48 }}>
        <h1 style={{
          font: "var(--fw-bold) 42px/1.1 var(--font-heading)",
          letterSpacing: "-0.02em", color: "var(--fg-1)", marginBottom: 16,
        }}>Decentralized Identity Explorer</h1>
        <p style={{
          font: "var(--fw-regular) 17px/1.6 var(--font-sans)",
          color: "var(--fg-3)", maxWidth: 640, margin: "0 auto 20px",
        }}>
          Verify student credentials, explore academic registries, and request access to encrypted educational transcripts across the SecureDID network.
        </p>
        {FACTORY_ADDRESS && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 12, color: "var(--fg-3)" }}>
            <span className="sd-pill sd-pill--active"><span className="sd-pill__dot" /> Base Sepolia</span>
            <span>Factory:</span>
            <AddressPill address={FACTORY_ADDRESS} />
            <a href={explorerAddress(FACTORY_ADDRESS)} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}>↗ Blockscout</a>
          </div>
        )}
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {/* ─── Student Verify Card ─── */}
      <div className="sd-card sd-card--pad" style={{ marginBottom: 24 }}>
        <div className="sd-card-title">Verify a student</div>
        <div className="sd-card-sub" style={{ marginTop: 6 }}>
          Search by student wallet address to view their university and identity status.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
          <input
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookupStudent(); } }}
            placeholder="0x... student address"
            className="sd-input sd-input--mono"
            style={{ flex: 1, minWidth: 240 }}
          />
          <button type="button" onClick={() => void lookupStudent()} className="sd-btn sd-btn--primary">
            {studentLoading ? "Searching…" : "Search"}
          </button>
        </div>

        {studentError && (
          <div className="sd-alert sd-alert--danger" style={{ marginTop: 12 }}>{studentError}</div>
        )}

        {studentResult && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--fg-4)" }}>Student:</span>
              <AddressPill address={studentResult.student} />
              <span style={{ fontSize: 12, color: "var(--fg-4)" }}>Registry:</span>
              <AddressPill address={studentResult.registry} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
              <span style={{ color: "var(--fg-3)" }}>University: <strong>{studentResult.institution}</strong></span>
              <span style={{ color: "var(--fg-3)" }}>Status: <strong>{STATUS_LABELS[studentResult.status] ?? "Unknown"}</strong></span>
              {studentResult.pending && <span style={{ color: "var(--warning-700, #a16207)" }}>Pending approval</span>}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void requestAccess()}
                className="sd-btn sd-btn--primary"
                disabled={studentResult.status === 3 || studentResult.pending}
              >
                Request access
              </button>
              {studentResult.status === 3 && (
                <span style={{ fontSize: 12, color: "var(--fg-4)" }}>Revoked identities cannot be requested.</span>
              )}
            </div>
            {requestMsg && (
              <div className="sd-alert sd-alert--info" style={{ fontSize: 12 }}>{requestMsg}</div>
            )}
          </div>
        )}
      </div>

      {/* ─── Access Request History Card ─── */}
      <div className="sd-card sd-card--pad" style={{ marginBottom: 24 }}>
        <div className="sd-card-title">Access request history</div>
        <div className="sd-card-sub" style={{ marginTop: 6 }}>Track third-party verification requests across registries.</div>

        {!ACCESS_MANAGER_ADDRESS && (
          <div className="sd-alert sd-alert--danger" style={{ marginTop: 12 }}>Access manager is not configured.</div>
        )}

        {ACCESS_MANAGER_ADDRESS && (
          <>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(["all", "active", "pending", "awaiting", "expired", "revoked"] as AccessFilter[]).map((k) => (
                <button key={k} onClick={() => setAccessFilter(k)} className={`sd-chip${accessFilter === k ? " active" : ""}`}>
                  {k}
                </button>
              ))}
            </div>

            {accessError && (
              <div className="sd-alert sd-alert--danger" style={{ marginTop: 12 }}>{accessError}</div>
            )}
            {accessLoading && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-4)" }}>Loading access requests…</div>
            )}

            {!accessLoading && accessRequests.length === 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-4)" }}>No access requests yet.</div>
            )}

            {!accessLoading && accessRequests.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {accessRequests.filter((r) => {
                  const expired = r.expiry > 0 && r.expiry * 1000 < Date.now();
                  if (accessFilter === "all") return true;
                  if (accessFilter === "revoked") return r.revoked;
                  if (accessFilter === "expired") return expired && !r.revoked;
                  if (accessFilter === "active") return r.active && !r.revoked;
                  if (accessFilter === "awaiting") return !r.active && !r.revoked && !expired && r.studentApproved;
                  return !r.active && !r.revoked && !expired && !r.studentApproved;
                }).map((r) => {
                  const expired = r.expiry > 0 && r.expiry * 1000 < Date.now();
                  const status = r.revoked ? "Revoked" : r.active ? "Active" : expired ? "Expired" : r.studentApproved ? "Awaiting university" : "Pending student";
                  const registryName = rows.find((row) => row.registry === r.registry)?.name ?? "Registry";
                  return (
                    <div key={r.id} className="sd-row" style={{ justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Request #{r.id} · <strong>{status}</strong></div>
                        <div style={{ fontSize: 12, color: "var(--fg-4)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <span>Student: <AddressPill address={r.student} /></span>
                          <span>Requester: <AddressPill address={r.requester} /></span>
                          <span>University: {registryName}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--fg-4)", textAlign: "right" }}>
                        <div>{r.approvals} approvals</div>
                        {r.expiry > 0 && <div>expires {new Date(r.expiry * 1000).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Search Bar ─── */}
      <div className="sd-card sd-card--pad" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (registryMatch) openRegistry();
              else if (directTarget) openDirectTarget();
              else if (didTarget) openDidTarget();
            }}
            placeholder="Search by registry name, address, tx hash, block, website, or owner"
            className="sd-input"
            style={{ flex: 1, minWidth: 240 }}
          />
          {registryMatch && (
            <button type="button" onClick={openRegistry} className="sd-btn sd-btn--primary">
              Open registry
            </button>
          )}
          {!registryMatch && directTarget && (
            <button type="button" onClick={openDirectTarget} className="sd-btn sd-btn--primary">
              {directTarget.label}
            </button>
          )}
          {!registryMatch && !directTarget && didTarget && (
            <button type="button" onClick={openDidTarget} className="sd-btn sd-btn--primary">
              {didTarget.label}
            </button>
          )}
          {!registryMatch && addressExplorerTarget && (
            <button type="button" onClick={() => window.open(addressExplorerTarget.href, "_blank", "noopener,noreferrer")} className="sd-btn sd-btn--secondary">
              {addressExplorerTarget.label}
            </button>
          )}
          {search && (
            <button type="button" onClick={() => setSearch("")} className="sd-btn sd-btn--secondary">
              Clear
            </button>
          )}
        </div>
        {normalizedSearch && rows.length > 0 && shouldFilterList && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-4)" }}>
            Showing {filteredRows.length} of {rows.length}
          </div>
        )}
      </div>

      {/* ─── Network Stats ─── */}
      {!loading && rows.length > 0 && (
        <div className="sd-stat-grid" style={{ marginBottom: 32 }}>
          <StatCard label="Institutions" value={rows.length} sub="Deployed registries" icon="🏛" gradientFrom="var(--accent-100)" gradientTo="var(--accent-50)" iconColor="var(--accent)" />
          <StatCard label="Students" value={totalStudents} sub="Issued DIDs" icon="👤" gradientFrom="#d1fae5" gradientTo="#ecfdf5" iconColor="var(--success)" />
          <StatCard label="Proposals" value={totalProposals} sub="Governance actions" icon="📋" gradientFrom="#e0e7ff" gradientTo="#eef2ff" iconColor="var(--info)" />
          <StatCard label="Revocations" value={totalRevoked} sub="Revoked identities" icon="⊘" gradientFrom="#fee2e2" gradientTo="#fef2f2" iconColor="var(--danger)" />
        </div>
      )}

      {/* ─── Loading / Empty States ─── */}
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

      {showNoResults && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 21l-4.3-4.3" /><circle cx="11" cy="11" r="7" /></svg>
          </div>
          <div className="sd-empty__title">No matches</div>
          <p className="sd-empty__sub">Try a different name or registry address.</p>
        </div>
      )}

      {/* ─── Featured Institutional Nodes ─── */}
      {!loading && filteredRows.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ font: "var(--fw-semibold) 20px/1.2 var(--font-heading)", color: "var(--fg-1)" }}>Featured Institutional Nodes</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {filteredRows.map((r) => (
              <Link key={r.registry} href={`/${r.registry}`} className="sd-card" style={{ display: "block", textDecoration: "none", overflow: "hidden" }}>
                <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: "var(--radius-lg)", flexShrink: 0,
                      background: "linear-gradient(135deg, var(--accent-100), var(--accent-50))",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)",
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-4h6v4" /></svg>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ font: "var(--fw-semibold) 16px/1.3 var(--font-heading)", color: "var(--fg-1)" }}>{r.name}</span>
                        <span className="sd-pill sd-pill--active" style={{ fontSize: 9 }}><span className="sd-pill__dot" /> Active</span>
                      </div>
                      {r.website && <div style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--accent)", marginTop: 4 }}>{r.website}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AddressPill address={r.registry} head={8} tail={6} showExplorer={false} />
                    <span style={{ fontSize: 12, color: "var(--fg-4)" }}>· {new Date(r.deployedAt * 1000).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, borderTop: "1px solid var(--border-subtle)", paddingTop: 16, textAlign: "center" }}>
                    <MiniStat label="Students"  value={r.studentCount} />
                    <MiniStat label="Proposals" value={r.proposalCount} />
                    <MiniStat label="Revoked"   value={r.revocationCount} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon, gradientFrom, gradientTo, iconColor }: { label: string; value: number; sub: string; icon: string; gradientFrom: string; gradientTo: string; iconColor: string }) {
  return (
    <div className="sd-stat" style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 12, right: 12, width: 40, height: 40, borderRadius: "var(--radius-md)", background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`, display: "flex", alignItems: "center", justifyContent: "center", color: iconColor, opacity: 0.7, fontSize: 20 }}>
        {icon}
      </div>
      <div className="sd-stat__label">{label}</div>
      <div className="sd-stat__value">{value}</div>
      <div className="sd-stat__sub">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ font: "var(--fw-medium) 10px/1 var(--font-sans)", color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ font: "var(--fw-semibold) 20px/1.2 var(--font-heading)", color: "var(--fg-1)", marginTop: 4 }}>{value}</div>
    </div>
  );
}
