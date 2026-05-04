"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import { useWallet, AddressPill, getRegistryRead } from "@securedid/shared";
import { FACTORY_ADDRESS, PLATFORM_ADDRESS } from "@/lib/env";
import { buildSiweMessage, randomNonce, verifySiweSignature } from "@/lib/siwe";

type Stage = "checking" | "needs-grant" | "revoked" | "needs-siwe" | "signed-in";

interface Row { subject: string; present: number; total: number; }

const ATTENDANCE: Row[] = [
  { subject: "Data Structures",     present: 34, total: 36 },
  { subject: "Operating Systems",   present: 28, total: 32 },
  { subject: "Cryptography",        present: 31, total: 31 },
  { subject: "Distributed Systems", present: 26, total: 30 },
  { subject: "Technical Comm.",     present: 18, total: 20 },
];

export default function Page() {
  const params   = useParams<{ registry: string }>();
  const registry = (params.registry ?? "").toLowerCase();

  const { address, getSigner } = useWallet();
  const [institutionName, setInstitutionName] = useState("Institution");
  const [stage, setStage]   = useState<Stage>("checking");
  const [error, setError]   = useState<string | null>(null);
  const [siweToken, setSiwe] = useState<{ message: string; signature: string; issuedAt: string } | null>(null);
  const [busy, setBusy]     = useState(false);
  const [vcSubject, setVcSubject] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!registry || !FACTORY_ADDRESS) return;
    (async () => {
      try {
        const reg = getRegistryRead(registry);
        const f = new ethers.Contract(
          FACTORY_ADDRESS,
          ["function getInstitution(address) view returns (string,string,uint256,address)"],
          reg.runner,
        );
        const info = await f.getInstitution(registry);
        setInstitutionName(info[0] as string);
      } catch { /* ignore */ }
    })();
  }, [registry]);

  const recheck = useCallback(async () => {
    setError(null);
    if (!registry || !PLATFORM_ADDRESS) { setError("Env not configured"); return; }
    if (!address) return;
    setStage("checking");
    try {
      const reg = getRegistryRead(registry);
      if (await reg.isStudentRevoked(address)) { setStage("revoked"); return; }
      const ok = await reg.hasAccess(address, PLATFORM_ADDRESS);
      if (!ok) { setStage("needs-grant"); return; }
      setStage(siweToken ? "signed-in" : "needs-siwe");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [registry, address, siweToken]);

  useEffect(() => { recheck(); }, [recheck]);

  useEffect(() => {
    if (stage !== "signed-in" || !address || !registry) return;
    (async () => {
      try {
        const reg = getRegistryRead(registry);
        const cid = await reg.getCID(address) as string;
        if (!cid || cid.length === 0) return;
        const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
        const url = cid.startsWith("data:") ? cid : `${gateway}/${cid}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const vc = await res.json() as { credentialSubject?: Record<string, unknown> };
        setVcSubject(vc.credentialSubject ?? null);
      } catch { /* ignore — VC display is best-effort */ }
    })();
  }, [stage, address, registry]);

  async function signIn() {
    setError(null);
    try {
      if (!address) throw new Error("Connect wallet first");
      setBusy(true);
      const issuedAt = new Date().toISOString();
      const message = buildSiweMessage({
        domain:    typeof window !== "undefined" ? window.location.host : "college.local",
        address,
        statement: `Sign in to ${institutionName} attendance portal. This request will not trigger any blockchain transaction or cost gas.`,
        uri:       typeof window !== "undefined" ? window.location.origin : "",
        version:   "1",
        chainId:   84532,
        nonce:     randomNonce(),
        issuedAt,
      });
      const signer = await getSigner();
      const signature = await signer.signMessage(message);
      if (!verifySiweSignature(message, signature, address)) throw new Error("Signature verification failed");
      setSiwe({ message, signature, issuedAt });
      setStage("signed-in");
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally { setBusy(false); }
  }

  const totalAtt   = ATTENDANCE.reduce((a, r) => a + r.total, 0);
  const presentAtt = ATTENDANCE.reduce((a, r) => a + r.present, 0);
  const pct        = ((presentAtt / totalAtt) * 100).toFixed(1);

  return (
    <div className="sd-page sd-page--md">
      <Link href="/" className="sd-back">← Back to institutions</Link>

      <div className="sd-page-header">
        <div className="sd-eyebrow">{institutionName}</div>
        <h1 className="sd-page-title">Attendance</h1>
        <p className="sd-page-sub">
          Two gates: (1) on-chain access grant on <AddressPill address={registry} head={8} tail={4} />, (2) EIP-4361 Sign-In-With-Ethereum.
        </p>
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {!address && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div className="sd-empty__title">Connect your wallet</div>
          <p className="sd-empty__sub">Your wallet is your identity. No username or password.</p>
        </div>
      )}

      {stage === "checking" && address && (
        <div style={{ font: "var(--fw-regular) 13px/1 var(--font-sans)", color: "var(--fg-3)", padding: "20px 0" }}>Verifying access…</div>
      )}

      {stage === "revoked" && (
        <div className="sd-alert sd-alert--danger">
          <div>
            <div className="sd-alert__title">Credential revoked</div>
            <div>Your DID has been revoked. Contact the admin office.</div>
          </div>
        </div>
      )}

      {stage === "needs-grant" && (
        <div className="sd-alert sd-alert--warn">
          <div>
            <div className="sd-alert__title">Access not granted</div>
            <div style={{ marginTop: 6 }}>Open the Student Portal and grant this platform address:</div>
            <div style={{ marginTop: 8 }}><AddressPill address={PLATFORM_ADDRESS} head={10} tail={6} /></div>
            <button onClick={recheck} className="sd-btn sd-btn--secondary sd-btn--sm" style={{ marginTop: 12 }}>Recheck</button>
          </div>
        </div>
      )}

      {stage === "needs-siwe" && (
        <div className="sd-card sd-card--pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="sd-card-title">On-chain access granted ✓</div>
            <div className="sd-card-sub" style={{ marginTop: 4 }}>
              Now prove control of your wallet with a gasless EIP-4361 signature. This produces a short-lived session token.
            </div>
          </div>
          <button onClick={signIn} disabled={busy} className="sd-btn sd-btn--primary" style={{ alignSelf: "flex-start" }}>
            {busy ? "Waiting on signature…" : "Sign in with Ethereum"}
          </button>
        </div>
      )}

      {stage === "signed-in" && siweToken && (
        <>
          <div className="sd-alert sd-alert--info" style={{ marginBottom: 24 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <div>
              <div className="sd-alert__title">Signed in via SIWE</div>
              <div>Session issued at {new Date(siweToken.issuedAt).toLocaleTimeString()}</div>
            </div>
          </div>

          {vcSubject && (
            <div className="sd-card sd-card--pad" style={{ marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {([
                  ["Name",        vcSubject.name],
                  ["Roll No.",    vcSubject.rollNumber],
                  ["Email",       vcSubject.email],
                  ["Department",  vcSubject.department],
                  ["Year",        vcSubject.year],
                  ["Institution", vcSubject.institution],
                ] as [string, unknown][]).filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, color: "var(--fg-4)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{String(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sd-metric-hero sd-metric-hero--college" style={{ marginBottom: 24 }}>
            <div className="sd-metric-hero__v">{pct}%</div>
            <div className="sd-metric-hero__l">Overall Attendance</div>
          </div>

          <div className="sd-card" style={{ overflow: "hidden", marginBottom: 16 }}>
            <table className="sd-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th style={{ textAlign: "right" }}>Present</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ textAlign: "right" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {ATTENDANCE.map((r) => {
                  const p = ((r.present / r.total) * 100).toFixed(1);
                  const low = parseFloat(p) < 75;
                  return (
                    <tr key={r.subject}>
                      <td>{r.subject}</td>
                      <td style={{ textAlign: "right" }}>{r.present}</td>
                      <td style={{ textAlign: "right" }}>{r.total}</td>
                      <td style={{ textAlign: "right" }} className={low ? "td-low" : "td-grade"}>{p}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <details>
            <summary style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--fg-4)", cursor: "pointer" }}>Show SIWE session details</summary>
            <div className="sd-siwe" style={{ marginTop: 12 }}>
              {parseSiwe(siweToken.message).map(([k, v]) => (
                <div key={k} className="sd-siwe-row">
                  <span className="sd-siwe-k">{k}</span>
                  <span className="sd-siwe-v">{v}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function parseSiwe(msg: string): [string, string][] {
  const lines = msg.split("\n").filter(Boolean);
  return [
    ["Domain",   lines[0]?.split(" ")[0] ?? ""],
    ["Address",  lines[1] ?? ""],
    ["Nonce",    lines.find((l) => l.startsWith("Nonce:"))?.replace("Nonce: ", "") ?? ""],
    ["Issued",   lines.find((l) => l.startsWith("Issued At:"))?.replace("Issued At: ", "") ?? ""],
    ["Chain",    lines.find((l) => l.startsWith("Chain ID:"))?.replace("Chain ID: ", "") ?? ""],
  ];
}
