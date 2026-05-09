"use client";
import { useState } from "react";
import { Verdict, DefenseCard } from "./Terminal";

export default function Impersonation() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    await new Promise(r => setTimeout(r, 1200));
    setBusy(false);
    setDone(true);
  }

  function reset() {
    setDone(false);
  }

  return (
    <div>
      <div className="atk-panel__header">
        <div className="atk-panel__info">
          <div className="atk-panel__title">🕵️ DID Impersonation — Forged VP</div>
          <div className="atk-panel__desc">
            An attacker generates their own ECDSA key pair and signs a Verifiable Presentation
            as if they were the victim student. The backend's signature verification catches the forgery.
          </div>
        </div>
        {done && (
          <button className="atk-launch atk-launch--reset" onClick={reset}>↻ Reset</button>
        )}
      </div>

      <div className="atk-panel__body" style={{ background: "var(--hk-surface2)", padding: "40px" }}>
        <div style={{ maxWidth: 400, margin: "0 auto" }}>
          <div style={{ background: "#ffffff", borderRadius: 16, padding: 32, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", color: "#111827", textAlign: "center" }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Access Third-Party Service</h2>
              <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                Submit your Verifiable Presentation to prove your identity.
              </p>
            </div>

            <div style={{ 
              background: "#f3f4f6", borderRadius: 8, padding: 12, marginBottom: 24, textAlign: "left",
              fontSize: 11, fontFamily: "var(--hk-mono)", color: "#4b5563"
            }}>
              <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>[FORGED PAYLOAD READY]</div>
              <div>holder: "did:securedid:base:0xVictim"</div>
              <div>signature: "0x3045... (Attacker's key)"</div>
            </div>

            {done && (
              <div style={{ 
                background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: 16, marginBottom: 24,
                color: "#991b1b", fontSize: 13, textAlign: "left"
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Authentication Failed (401)</div>
                <div style={{ fontFamily: "var(--hk-mono)", fontSize: 11 }}>
                  - VP signature verification FAILED<br/>
                  - Signer public key does not match DID Document
                </div>
              </div>
            )}

            <button 
              onClick={submit} 
              disabled={busy || done} 
              style={{ 
                width: "100%", padding: "12px", background: done ? "#d1d5db" : "#8b5cf6", color: "#fff", 
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy || done ? "not-allowed" : "pointer"
              }}
            >
              {busy ? "Authenticating..." : done ? "Access Denied" : "Submit Forged VP"}
            </button>
          </div>
        </div>

        {done && (
          <div style={{ marginTop: 40, animation: "atk-verdict-in 0.5s ease" }}>
            <Verdict
              blocked
              title="IMPERSONATION BLOCKED"
              sub="ECDSA P-256 signature verification ensures only the holder of the private key matching the on-chain public key can authenticate. Forged signatures are mathematically impossible to create without the real key."
            />
            <DefenseCard items={[
              "VP must be signed with the private key matching the DID Document's verificationMethod",
              "ECDSA P-256 provides 128-bit security — computationally infeasible to forge",
              "On-chain public key anchoring binds identity to a specific key pair",
            ]} />
          </div>
        )}
      </div>
    </div>
  );
}
