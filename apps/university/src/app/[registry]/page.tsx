"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ethers } from "ethers";
import { useWallet, AddressPill, getRegistryRead } from "@securedid/shared";
import { FACTORY_ADDRESS, PLATFORM_ADDRESS } from "@/lib/env";

type Stage = "idle" | "checking" | "denied" | "revoked" | "granted";

interface Course { code: string; name: string; credits: number; grade: string; gp: number; }

const TRANSCRIPT: Course[] = [
  { code: "CS101", name: "Data Structures",         credits: 4, grade: "A",  gp: 10 },
  { code: "CS102", name: "Algorithms",               credits: 4, grade: "A-", gp: 9  },
  { code: "CS201", name: "Operating Systems",       credits: 3, grade: "B+", gp: 8  },
  { code: "CS202", name: "Databases",                credits: 3, grade: "A",  gp: 10 },
  { code: "CS301", name: "Cryptography",             credits: 4, grade: "A",  gp: 10 },
  { code: "CS302", name: "Distributed Systems",     credits: 4, grade: "A-", gp: 9  },
  { code: "HS101", name: "Technical Communication", credits: 2, grade: "B+", gp: 8  },
];

export default function Page() {
  const params   = useParams<{ registry: string }>();
  const registry = (params.registry ?? "").toLowerCase();

  const { address } = useWallet();
  const [institutionName, setInstitutionName] = useState("Institution");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
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

  const verify = useCallback(async () => {
    setError(null);
    if (!registry || !PLATFORM_ADDRESS) { setError("Env not configured"); return; }
    if (!address) return;
    setStage("checking");
    try {
      const reg = getRegistryRead(registry);
      const revoked = await reg.isStudentRevoked(address);
      if (revoked) { setStage("revoked"); return; }
      const ok = await reg.hasAccess(address, PLATFORM_ADDRESS);
      setStage(ok ? "granted" : "denied");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }, [registry, address]);

  useEffect(() => { verify(); }, [verify]);

  useEffect(() => {
    if (stage !== "granted" || !address || !registry) return;
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

  const total    = TRANSCRIPT.reduce((a, c) => a + c.credits, 0);
  const weighted = TRANSCRIPT.reduce((a, c) => a + c.credits * c.gp, 0);
  const cgpa     = (weighted / total).toFixed(2);

  return (
    <div className="sd-page sd-page--md">
      <Link href="/" className="sd-back">← Back to institutions</Link>

      <div className="sd-page-header">
        <div className="sd-eyebrow">{institutionName}</div>
        <h1 className="sd-page-title">Academic Transcript</h1>
        <p className="sd-page-sub">
          Access gated by on-chain DID verification against{" "}
          <AddressPill address={registry} head={8} tail={4} />.
        </p>
      </div>

      {error && <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>{error}</div>}

      {!address && (
        <div className="sd-card sd-card--pad sd-empty">
          <div className="sd-empty__illus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div className="sd-empty__title">Connect your wallet</div>
          <p className="sd-empty__sub">No passwords — your wallet IS your identity.</p>
        </div>
      )}

      {address && stage === "checking" && (
        <div style={{ font: "var(--fw-regular) 13px/1 var(--font-sans)", color: "var(--fg-3)", padding: "20px 0" }}>Verifying access on-chain…</div>
      )}

      {stage === "revoked" && (
        <div className="sd-alert sd-alert--danger">
          <div>
            <div className="sd-alert__title">Credential revoked</div>
            <div>Your DID has been revoked by the issuing institution. Please contact the admin office.</div>
          </div>
        </div>
      )}

      {stage === "denied" && (
        <div className="sd-alert sd-alert--warn">
          <div>
            <div className="sd-alert__title">Access not granted</div>
            <div style={{ marginTop: 6 }}>
              To view your transcript, open the <strong>Student Portal</strong> and grant this platform access.
            </div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "inherit" }}>Platform:</span>
              <AddressPill address={PLATFORM_ADDRESS} head={8} tail={4} />
            </div>
            <button onClick={verify} className="sd-btn sd-btn--secondary sd-btn--sm" style={{ marginTop: 12 }}>Recheck</button>
          </div>
        </div>
      )}

      {stage === "granted" && (
        <>
          <div className="sd-alert sd-alert--info" style={{ marginBottom: 24 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <div>
              <div className="sd-alert__title">Access granted via on-chain DID</div>
              <div>Your DID credential is valid and this platform has been granted access.</div>
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

          <div className="sd-metric-hero sd-metric-hero--university" style={{ marginBottom: 24 }}>
            <div className="sd-metric-hero__v">{cgpa}</div>
            <div className="sd-metric-hero__l">Cumulative GPA</div>
          </div>

          <div className="sd-card" style={{ overflow: "hidden" }}>
            <table className="sd-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course</th>
                  <th style={{ textAlign: "right" }}>Credits</th>
                  <th style={{ textAlign: "right" }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {TRANSCRIPT.map((c) => (
                  <tr key={c.code}>
                    <td className="td-mono">{c.code}</td>
                    <td>{c.name}</td>
                    <td style={{ textAlign: "right" }}>{c.credits}</td>
                    <td style={{ textAlign: "right" }} className="td-grade">{c.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
