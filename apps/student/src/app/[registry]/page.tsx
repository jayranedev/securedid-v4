"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import {
  useWallet, AddressPill, getRegistryRead, getRegistryWrite,
  computeCommitment, EnrollmentFields, getMetaMaskEncryptionPubkey,
  getAccessManagerRead, getAccessManagerWrite,
} from "@securedid/shared";
import { ACCESS_MANAGER_ADDRESS } from "@/lib/env";

type Stage = "loading" | "not-registered" | "pending" | "issued" | "revoked";

export default function Page() {
  const params = useParams<{ registry: string }>();
  const registry = (params.registry ?? "").toLowerCase();
  const { address, getSigner } = useWallet();

  const [institutionName, setInstitutionName] = useState("Institution");
  const [stage, setStage]   = useState<Stage>("loading");
  const [approvals, setApprovals] = useState(0);
  const [cid, setCid]       = useState<string | null>(null);
  const [revIdx, setRevIdx] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!registry || !address) return;
    setStage("loading");
    try {
      const reg = getRegistryRead(registry);

      const factoryAddr = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
      if (factoryAddr) {
        try {
          const factory = new ethers.Contract(
            factoryAddr,
            ["function getInstitution(address) view returns (string,string,uint256,address)"],
            reg.runner,
          );
          const info = await factory.getInstitution(registry);
          setInstitutionName(info[0] as string);
        } catch { /* ignore */ }
      }

      const revoked = await reg.isStudentRevoked(address);
      if (revoked) { setStage("revoked"); return; }

      const rawCid = await reg.getCID(address) as string;
      if (rawCid && rawCid.length > 0) {
        setCid(rawCid);
        setRevIdx(Number(await reg.revocationIndex(address)));
        setStage("issued"); return;
      }

      const isPending = await reg.pendingRegistration(address);
      if (isPending) {
        setApprovals(Number(await reg.approvalCount(address)));
        setStage("pending"); return;
      }

      setStage("not-registered");
    } catch (e) {
      console.error(e);
      setStage("not-registered");
    }
  }, [registry, address]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="sd-page sd-page--narrow">
      <Link href="/" className="sd-back">← Back to institutions</Link>

      <div className="sd-page-header">
        <div className="sd-eyebrow">Student Portal</div>
        <h1 className="sd-page-title">{institutionName}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <AddressPill address={registry} />
        </div>
      </div>

      {!address && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div className="sd-empty__title">Connect your wallet</div>
          <p className="sd-empty__sub">Your wallet address is your identity. Connect your wallet to proceed.</p>
        </div>
      )}

      {address && stage === "loading" && (
        <div style={{ color: "var(--fg-4)", fontSize: 13 }}>Loading…</div>
      )}

      {address && stage === "not-registered" && (
        <RegisterForm registry={registry} onDone={refresh} />
      )}

      {address && stage === "pending" && (
        <PendingCard approvals={approvals} onRefresh={refresh} />
      )}

      {address && stage === "issued" && cid && (
        <IssuedCard registry={registry} cid={cid} revIdx={revIdx ?? 0} address={address} getSigner={getSigner} />
      )}

      {address && stage === "revoked" && (
        <div className="sd-alert sd-alert--danger">
          <div>
            <div className="sd-alert__title">Credential revoked</div>
            <div>A panelist vote has revoked your DID at this institution. Contact the institution&apos;s admin office.</div>
          </div>
        </div>
      )}

      {address && (
        <StudentAccessRequests registry={registry} student={address} />
      )}
    </div>
  );
}

function RegisterForm({ registry, onDone }: { registry: string; onDone: () => Promise<void> }) {
  const { address, getSigner } = useWallet();
  const [f, setF] = useState<EnrollmentFields>({
    email: "", roll: "", name: "", department: "", year: new Date().getFullYear(), secret: "",
  });
  const [metadataHash, setMetadataHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    try {
      if (!f.email || !f.roll || !f.name || !f.department || !f.secret) throw new Error("Please fill every field");
      setBusy(true);
      const commitment = await computeCommitment(f);
      const reg = getRegistryRead(registry);
      const authorized = await reg.isEnrollmentAuthorized(commitment);
      if (!authorized) throw new Error("This commitment is not authorized. A panelist must first submit and pass an Enrollment proposal matching exactly these details.");

      let encPubBytes = "0x";
      try {
        setMsg("Requesting wallet encryption public key…");
        const encPubBase64 = await getMetaMaskEncryptionPubkey(address ?? "");
        // Wallet encryption methods return base64; decode to raw 32 bytes before sending on-chain.
        encPubBytes = ethers.hexlify(Uint8Array.from(atob(encPubBase64), (c) => c.charCodeAt(0)));
      } catch {
        throw new Error("Wallet does not expose an encryption public key. Use MetaMask or a wallet that supports eth_getEncryptionPublicKey.");
      }
      if (!ethers.isHexString(encPubBytes, 32)) {
        throw new Error("Bad encryption pubkey. Reconnect your wallet and try again.");
      }
      const metaHash = metadataHash.trim() || ethers.keccak256(ethers.toUtf8Bytes(`${f.email}:${f.roll}`));

      setMsg("Submitting registerStudent…");
      const signer = await getSigner();
      const regW   = await getRegistryWrite(registry, signer);
      const tx     = await regW.registerStudent(metaHash, commitment, encPubBytes);
      setMsg(`Broadcasting — ${tx.hash.slice(0, 12)}…`);
      await tx.wait();
      setMsg("✓ Registered. Awaiting panelist approvals.");
      await onDone();
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message.split("\n")[0].slice(0, 260) : String(e)}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="sd-card sd-card--pad" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="sd-card-title">Register for a DID</div>
        <div className="sd-card-sub" style={{ marginTop: 4 }}>Enter the exact same details your panelist used when pre-authorizing your enrollment. Your secret never leaves this browser.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} placeholder="you@college.edu" />
        <Field label="Roll number" value={f.roll} onChange={(v) => setF({ ...f, roll: v })} placeholder="CS2024-042" />
        <Field label="Full name" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Jane Doe" />
        <Field label="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} placeholder="Computer Engineering" />
        <Field label="Year" type="number" value={String(f.year)} onChange={(v) => setF({ ...f, year: Number(v) })} placeholder="2024" />
        <Field label="Secret" value={f.secret} onChange={(v) => setF({ ...f, secret: v })} placeholder="shared with panelist" />
      </div>

      <Field label="Metadata hash (optional)" value={metadataHash} onChange={setMetadataHash}
        placeholder="Auto-derived if empty" hint="Off-chain pointer to your encrypted metadata bundle; can be left blank." />

      {msg && (
        <div className="sd-alert sd-alert--info" style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>{msg}</div>
      )}

      <button onClick={submit} disabled={busy} className="sd-btn sd-btn--primary" style={{ width: "100%", justifyContent: "center" }}>
        {busy ? "Working…" : "Submit registration"}
      </button>
    </div>
  );
}

function PendingCard({ approvals, onRefresh }: { approvals: number; onRefresh: () => void }) {
  return (
    <div className="sd-card sd-card--pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="sd-card-title">Awaiting panelist approvals</div>
      <div className="sd-card-sub">Your registration is on-chain. Three of five panelists must approve and pin your encrypted VC to IPFS before your DID is live.</div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, color: "var(--fg-3)", marginBottom: 8 }}>
          <span>Approvals</span>
          <span style={{ font: "var(--fw-semibold) 20px/1 var(--font-display)", color: "var(--fg-1)" }}>{approvals} <span style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--fg-4)" }}>of 3</span></span>
        </div>
        <div className="sd-progress">
          <div className="sd-progress__fill" style={{ width: `${Math.min(100, (approvals / 3) * 100)}%` }} />
        </div>
      </div>

      <button onClick={onRefresh} className="sd-btn sd-btn--secondary sd-btn--sm" style={{ alignSelf: "flex-start" }}>
        Refresh status
      </button>
    </div>
  );
}

/* ── SVG Icon helpers ── */
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const ChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const ShieldCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const CredentialIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" /><path d="m9 15 2 2 4-4" />
  </svg>
);

function CopyButton({ text, label, variant = "icon" }: { text: string; label?: string; variant?: "icon" | "text" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  if (variant === "text") {
    return (
      <button onClick={copy} className="sd-vc-field__copy" title={`Copy ${label ?? ""}`}>
        {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
      </button>
    );
  }
  return (
    <button onClick={copy} className="sd-icon-btn" title={`Copy ${label ?? ""}`}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function IssuedCard({
  registry, cid, revIdx, address, getSigner,
}: { registry: string; cid: string; revIdx: number; address: string; getSigner: () => Promise<ethers.JsonRpcSigner> }) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decBusy, setDecBusy]     = useState(false);
  const [decErr, setDecErr]       = useState<string | null>(null);
  const [showRaw, setShowRaw]     = useState(false);
  const [toastMsg, setToastMsg]   = useState<string | null>(null);

  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
  const vcUrl   = cid.startsWith("data:") ? cid : `${gateway}/${cid}`;
  const did     = `did:securedid:${registry.slice(2, 10)}:${address}`;
  const explorerUrl = `https://sepolia.basescan.org/address/${registry}`;

  async function viewCredential() {
    setDecErr(null); setDecBusy(true);
    try {
      if (cid.startsWith("data:")) {
        const base64 = cid.split(",")[1];
        setDecrypted(decodeURIComponent(escape(atob(base64))));
      } else {
        const res = await fetch(vcUrl);
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        setDecrypted(await res.text());
      }
    } catch (e) {
      setDecErr(e instanceof Error ? e.message : String(e));
    } finally { setDecBusy(false); }
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }

  async function copyJson() {
    if (!decrypted) return;
    try { await navigator.clipboard.writeText(safeFormatJson(decrypted)); } catch { /* ignore */ }
    showToast("Credential JSON copied!");
  }

  async function downloadJson() {
    if (!decrypted) return;
    const blob = new Blob([safeFormatJson(decrypted)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vc-${did.slice(0, 24)}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("Credential downloaded!");
  }

  // Parse the VC JSON into structured fields
  const vcData = decrypted ? safeParseVc(decrypted) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ─── Identity Hero Card ─── */}
      <div className="sd-identity-hero">
        <div className="sd-identity-hero__content">
          <div className="sd-identity-hero__top">
            <div>
              <div className="sd-eyebrow" style={{ marginBottom: 4 }}>Decentralized Identifier</div>
              <div className="sd-identity-hero__title">Your DID</div>
              <div className="sd-identity-hero__subtitle">Issued on Base Sepolia</div>
            </div>
            <span className="sd-vc-badge sd-vc-badge--verified">
              <ShieldCheckIcon /> Active
            </span>
          </div>

          {/* DID Pill */}
          <div className="sd-did-pill">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sd-did-pill__label">Decentralized Identifier (DID)</div>
              <div className="sd-did-pill__value">{did}</div>
            </div>
            <div className="sd-did-pill__actions">
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="sd-verify-link">
                Verify on Explorer <ExternalIcon />
              </a>
              <CopyButton text={did} label="DID" />
            </div>
          </div>

          {/* Stats */}
          <div className="sd-identity-hero__stats">
            <div className="sd-identity-stat">
              <div className="sd-identity-stat__label">Network</div>
              <div className="sd-identity-stat__value">Base Sepolia</div>
            </div>
            <div className="sd-identity-stat">
              <div className="sd-identity-stat__label">Rev. Index</div>
              <div className="sd-identity-stat__value">#{revIdx}</div>
            </div>
            <div className="sd-identity-stat">
              <div className="sd-identity-stat__label">IPFS CID</div>
              <div className="sd-identity-stat__value" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {cid.slice(0, 18)}…
                <CopyButton text={cid} label="CID" />
              </div>
            </div>
            <div className="sd-identity-stat">
              <div className="sd-identity-stat__label">Registry</div>
              <div className="sd-identity-stat__value" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {registry.slice(0, 6)}…{registry.slice(-4)}
                <CopyButton text={registry} label="Registry" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Verifiable Credential Card ─── */}
      <div className="sd-vc-card">
        {/* Header */}
        <div className="sd-vc-card__header">
          <div className="sd-vc-card__header-left">
            <div className="sd-vc-card__icon"><CredentialIcon /></div>
            <div>
              <div className="sd-vc-card__title">Verifiable Credential</div>
              <div className="sd-vc-card__sub">W3C Verifiable Credential stored on IPFS</div>
            </div>
          </div>
          <div className="sd-vc-card__header-right">
            {!cid.startsWith("data:") && (
              <span className="sd-vc-badge sd-vc-badge--ipfs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" /></svg>
                IPFS Pinned
              </span>
            )}
            {vcData && (
              <span className="sd-vc-badge sd-vc-badge--onchain">
                <ShieldCheckIcon /> On-Chain
              </span>
            )}
          </div>
        </div>

        {/* Fetch / Loading state */}
        {!decrypted && !decBusy && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ color: "var(--fg-3)", fontSize: 13, marginBottom: 16 }}>Fetch your credential to view the structured details.</div>
            <button onClick={viewCredential} disabled={decBusy} className="sd-btn sd-btn--primary" style={{ justifyContent: "center" }}>
              View Credential
            </button>
          </div>
        )}
        {decBusy && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div className="sd-skel" style={{ height: 200, borderRadius: "var(--radius-md)" }} />
          </div>
        )}
        {decErr && (
          <div style={{ padding: 24 }}>
            <div className="sd-alert sd-alert--danger" style={{ fontSize: 13 }}>{decErr}</div>
          </div>
        )}

        {/* Structured Fields */}
        {vcData && (
          <>
            <div className="sd-vc-fields">
              {vcData.type && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Credential Type</div>
                  <div className="sd-vc-field__value">{vcData.type}</div>
                </div>
              )}
              {vcData.issuer && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Issuer</div>
                  <div className="sd-vc-field__value sd-vc-field__value--truncate">
                    <span className="sd-vc-field__value--mono">{vcData.issuer.length > 42 ? `${vcData.issuer.slice(0, 20)}…${vcData.issuer.slice(-12)}` : vcData.issuer}</span>
                    <CopyButton text={vcData.issuer} label="Issuer" variant="text" />
                  </div>
                </div>
              )}
              {vcData.issuanceDate && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Issuance Date</div>
                  <div className="sd-vc-field__value">{formatVcDate(vcData.issuanceDate)}</div>
                </div>
              )}
              {vcData.expirationDate && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Expiration Date</div>
                  <div className="sd-vc-field__value">{formatVcDate(vcData.expirationDate)}</div>
                </div>
              )}
              {vcData.subjectId && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Subject (DID)</div>
                  <div className="sd-vc-field__value sd-vc-field__value--truncate">
                    <span className="sd-vc-field__value--mono">{vcData.subjectId.length > 42 ? `${vcData.subjectId.slice(0, 20)}…${vcData.subjectId.slice(-12)}` : vcData.subjectId}</span>
                    <CopyButton text={vcData.subjectId} label="Subject" variant="text" />
                  </div>
                </div>
              )}
              {vcData.credentialStatus && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Credential Status</div>
                  <div className="sd-vc-field__value">{vcData.credentialStatus}</div>
                </div>
              )}
              {vcData.proofType && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Proof Type</div>
                  <div className="sd-vc-field__value">{vcData.proofType}</div>
                </div>
              )}
              {vcData.proofCreated && (
                <div className="sd-vc-field">
                  <div className="sd-vc-field__label">Proof Created</div>
                  <div className="sd-vc-field__value">{formatVcDate(vcData.proofCreated)}</div>
                </div>
              )}
              {/* Render any custom subject claims */}
              {vcData.claims.map(([k, v]) => (
                <div key={k} className="sd-vc-field">
                  <div className="sd-vc-field__label">{humanizeKey(k)}</div>
                  <div className="sd-vc-field__value">{typeof v === "string" ? v : JSON.stringify(v)}</div>
                </div>
              ))}
              {vcData.proofValue && (
                <div className="sd-vc-field sd-vc-field--full">
                  <div className="sd-vc-field__label">Cryptographic Proof</div>
                  <div className="sd-vc-field__value sd-vc-field__value--mono" style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.85 }}>
                    {vcData.proofValue.slice(0, 80)}…
                    <CopyButton text={vcData.proofValue} label="Proof" variant="text" />
                  </div>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div className="sd-vc-actions">
              {!cid.startsWith("data:") && (
                <a href={vcUrl} target="_blank" rel="noopener noreferrer" className="sd-btn sd-btn--secondary sd-btn--sm">
                  <ExternalIcon /> Open on IPFS
                </a>
              )}
              <button onClick={copyJson} className="sd-btn sd-btn--secondary sd-btn--sm">
                <CopyIcon /> Copy JSON
              </button>
              <button onClick={downloadJson} className="sd-btn sd-btn--secondary sd-btn--sm">
                <DownloadIcon /> Download
              </button>
              <button onClick={viewCredential} disabled={decBusy} className="sd-btn sd-btn--ghost sd-btn--sm" style={{ marginLeft: "auto" }}>
                {decBusy ? "Fetching…" : "Refresh"}
              </button>
            </div>

            {/* Raw JSON toggle */}
            <div className="sd-vc-raw">
              <button className="sd-vc-raw__toggle" data-open={String(showRaw)} onClick={() => setShowRaw(!showRaw)}>
                <span>Raw JSON</span>
                <ChevronDown />
              </button>
              {showRaw && (
                <div className="sd-vc-raw__content">
                  <button className="sd-vc-raw__copy" onClick={copyJson}><CopyIcon /> Copy</button>
                  <pre className="sd-json">
                    {decrypted ? safeFormatJson(decrypted) : "No decrypted data"}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AccessGrantPanel registry={registry} getSigner={getSigner} />

      {/* Clipboard toast */}
      <div className={`sd-copied-toast ${toastMsg ? "show" : ""}`}>
        <CheckIcon /> {toastMsg}
      </div>
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
}

function StudentAccessRequests({ registry, student }: { registry: string; student: string }) {
  const { getSigner } = useWallet();
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [loading, setLoad] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [durationById, setDurationById] = useState<Record<number, number>>({});
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
        };
        if (row.student === student.toLowerCase() && row.registry === registry.toLowerCase()) {
          out.push(row);
        }
      }
      setRequests(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally { setLoad(false); }
  }

  useEffect(() => {
    void refresh();
  }, [registry, student]);

  async function approve(id: number) {
    if (!ACCESS_MANAGER_ADDRESS) return;
    const duration = durationById[id] ?? 90 * 24 * 60 * 60;
    setBusy(id);
    try {
      const signer = await getSigner();
      const mgr = await getAccessManagerWrite(ACCESS_MANAGER_ADDRESS, signer);
      const tx = await mgr.approveByStudent(id, duration);
      await tx.wait();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Approval failed");
    } finally { setBusy(null); }
  }

  async function revoke(id: number) {
    if (!ACCESS_MANAGER_ADDRESS) return;
    setBusy(id);
    try {
      const signer = await getSigner();
      const mgr = await getAccessManagerWrite(ACCESS_MANAGER_ADDRESS, signer);
      const tx = await mgr.revokeAccess(id);
      await tx.wait();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Revoke failed");
    } finally { setBusy(null); }
  }

  if (!ACCESS_MANAGER_ADDRESS) {
    return (
      <div className="sd-card sd-card--pad" style={{ marginTop: 20 }}>
        <div className="sd-card-title">Access requests</div>
        <div className="sd-card-sub" style={{ marginTop: 6 }}>Access manager is not configured.</div>
      </div>
    );
  }

  return (
    <div className="sd-card sd-card--pad" style={{ marginTop: 20 }}>
      <div className="sd-card-title">Access requests</div>
      <div className="sd-card-sub" style={{ marginTop: 6 }}>Approve or revoke third-party access to your academic data.</div>

      {error && (
        <div className="sd-alert sd-alert--danger" style={{ marginTop: 12 }}>{error}</div>
      )}

      {loading && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-4)" }}>Loading requests…</div>
      )}

      {!loading && requests.length === 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-4)" }}>No access requests yet.</div>
      )}

      {!loading && requests.map((r) => {
        const expired = r.expiry > 0 && r.expiry * 1000 < Date.now();
        const status = r.revoked ? "Revoked" : r.active ? "Active" : expired ? "Expired" : r.studentApproved ? "Awaiting university" : "Pending your approval";
        return (
          <div key={r.id} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Request #{r.id}</div>
              <div style={{ fontSize: 12, color: "var(--fg-2)", fontWeight: 600 }}>{status}</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--fg-4)" }}>
              Requester: <AddressPill address={r.requester} />
            </div>
            {r.studentApproved && r.expiry > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--fg-4)" }}>
                Expires: {new Date(r.expiry * 1000).toLocaleDateString()}
              </div>
            )}

            {!r.studentApproved && !r.revoked && !expired && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={durationById[r.id] ?? 90 * 24 * 60 * 60}
                  onChange={(e) => setDurationById({ ...durationById, [r.id]: Number(e.target.value) })}
                  className="sd-input"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                >
                  <option value={30 * 24 * 60 * 60}>30 days</option>
                  <option value={90 * 24 * 60 * 60}>90 days</option>
                  <option value={180 * 24 * 60 * 60}>180 days</option>
                  <option value={365 * 24 * 60 * 60}>365 days</option>
                </select>
                <button onClick={() => approve(r.id)} disabled={busy !== null} className="sd-btn sd-btn--primary">
                  {busy === r.id ? "Approving…" : "Approve"}
                </button>
              </div>
            )}

            {r.studentApproved && !r.revoked && !expired && (
              <div style={{ marginTop: 10 }}>
                <button onClick={() => revoke(r.id)} disabled={busy !== null} className="sd-btn sd-btn--secondary">
                  {busy === r.id ? "Revoking…" : "Revoke access"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function safeFormatJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

/* ── VC JSON parser ── */
interface VcParsed {
  type: string;
  issuer: string;
  issuanceDate: string;
  expirationDate: string;
  subjectId: string;
  credentialStatus: string;
  proofType: string;
  proofCreated: string;
  proofValue: string;
  claims: [string, unknown][];
}

function safeParseVc(raw: string): VcParsed | null {
  try {
    const vc = JSON.parse(raw);
    const types: string[] = Array.isArray(vc.type) ? vc.type : [vc.type ?? "Unknown"];
    const issuer = typeof vc.issuer === "string" ? vc.issuer : vc.issuer?.id ?? "";
    const subject = vc.credentialSubject ?? {};
    const proof = vc.proof ?? {};

    // Extract subject claims (skip "id" as it's shown separately)
    const skipKeys = new Set(["id", "type"]);
    const claims: [string, unknown][] = Object.entries(subject).filter(([k]) => !skipKeys.has(k));

    // Credential status
    let statusStr = "";
    if (vc.credentialStatus) {
      statusStr = vc.credentialStatus.type ?? "Active";
    }

    return {
      type: types.filter((t: string) => t !== "VerifiableCredential").join(", ") || types.join(", "),
      issuer,
      issuanceDate: vc.issuanceDate ?? "",
      expirationDate: vc.expirationDate ?? "",
      subjectId: subject.id ?? "",
      credentialStatus: statusStr,
      proofType: proof.type ?? "",
      proofCreated: proof.created ?? "",
      proofValue: proof.proofValue ?? proof.jws ?? proof.signatureValue ?? "",
      claims,
    };
  } catch {
    return null;
  }
}

function formatVcDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function AccessGrantPanel({ registry, getSigner }: { registry: string; getSigner: () => Promise<ethers.JsonRpcSigner> }) {
  const [platform, setPlatform] = useState("");
  const [ttlMin, setTtlMin]     = useState(60);
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  async function grant() {
    setMsg(null);
    try {
      if (!ethers.isAddress(platform)) throw new Error("Invalid platform address");
      if (ttlMin <= 0) throw new Error("TTL must be > 0");
      setBusy(true);
      const signer = await getSigner();
      const reg = await getRegistryWrite(registry, signer);
      const tx  = await reg.grantAccess(platform, ttlMin * 60);
      setMsg(`tx ${tx.hash.slice(0, 12)}…`);
      await tx.wait();
      setMsg(`✓ Access granted to ${platform.slice(0, 10)}… for ${ttlMin}min`);
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e)}`);
    } finally { setBusy(false); }
  }

  async function revoke() {
    setMsg(null);
    try {
      if (!ethers.isAddress(platform)) throw new Error("Invalid platform address");
      setBusy(true);
      const signer = await getSigner();
      const reg = await getRegistryWrite(registry, signer);
      const tx  = await reg.revokeAccess(platform);
      await tx.wait();
      setMsg(`✓ Access revoked for ${platform.slice(0, 10)}…`);
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e)}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="sd-card sd-card--pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="sd-card-title">Access grants</div>
      <div className="sd-card-sub">Authorize a third-party platform (university portal, college portal) to verify your DID for a limited time.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px auto auto", gap: 8, alignItems: "center" }}>
        <input value={platform} onChange={(e) => setPlatform(e.target.value.trim())}
          placeholder="Platform address (0x…)" className="sd-input sd-input--mono" />
        <input type="number" value={ttlMin} onChange={(e) => setTtlMin(Number(e.target.value))}
          placeholder="TTL min" className="sd-input" />
        <button onClick={grant} disabled={busy} className="sd-btn sd-btn--primary sd-btn--sm">Grant</button>
        <button onClick={revoke} disabled={busy} className="sd-btn sd-btn--secondary sd-btn--sm">Revoke</button>
      </div>
      {msg && <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--fg-2)", wordBreak: "break-all" }}>{msg}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div className="sd-field">
      <label className="sd-label">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} className="sd-input" />
      {hint && <div className="sd-help">{hint}</div>}
    </div>
  );
}
