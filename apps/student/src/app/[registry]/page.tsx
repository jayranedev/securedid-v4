"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import {
  useWallet, AddressPill, getRegistryRead, getRegistryWrite,
  computeCommitment, EnrollmentFields, getMetaMaskEncryptionPubkey,
} from "@securedid/shared";

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
        // Not every RainbowKit wallet supports eth_getEncryptionPublicKey; skip encryption when unavailable.
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

function IssuedCard({
  registry, cid, revIdx, address, getSigner,
}: { registry: string; cid: string; revIdx: number; address: string; getSigner: () => Promise<ethers.JsonRpcSigner> }) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decBusy, setDecBusy]     = useState(false);
  const [decErr, setDecErr]       = useState<string | null>(null);

  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
  const vcUrl   = cid.startsWith("data:") ? cid : `${gateway}/${cid}`;
  const did     = `did:securedid:${registry.slice(2, 10)}:${address}`;

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="sd-did-card sd-did-card--student">
        <div className="sd-did-card__inner">
          <div className="sd-did-card__top">
            <div>
              <div className="sd-did-card__inst">SecureDID</div>
              <div className="sd-did-card__name">Your DID</div>
            </div>
            <span style={{ fontSize: 11, opacity: 0.75 }}>Base Sepolia</span>
          </div>
          <div className="sd-did-card__did">{did}</div>
          <div className="sd-did-card__stats">
            <div>
              <div className="sd-did-card__stat-label">Rev. Index</div>
              <div className="sd-did-card__stat-val">#{revIdx}</div>
            </div>
            <div>
              <div className="sd-did-card__stat-label">IPFS CID</div>
              <div className="sd-did-card__stat-val">{cid.slice(0, 14)}…</div>
            </div>
          </div>
        </div>
      </div>

      {/* Verifiable Credential */}
      <div className="sd-card sd-card--pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="sd-card-title">Verifiable Credential</div>
        <div className="sd-card-sub">Your W3C Verifiable Credential stored on IPFS.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!cid.startsWith("data:") && (
            <a href={vcUrl} target="_blank" rel="noopener noreferrer" className="sd-btn sd-btn--secondary sd-btn--sm">
              Open on IPFS →
            </a>
          )}
          <button onClick={viewCredential} disabled={decBusy} className="sd-btn sd-btn--primary sd-btn--sm">
            {decBusy ? "Fetching…" : decrypted ? "Refresh" : "View credential"}
          </button>
        </div>
        {decErr && <div className="sd-alert sd-alert--danger" style={{ fontSize: 12 }}>{decErr}</div>}
        {decrypted && <pre className="sd-json">{safeFormatJson(decrypted)}</pre>}
      </div>

      <AccessGrantPanel registry={registry} getSigner={getSigner} />
    </div>
  );
}

function safeFormatJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
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
