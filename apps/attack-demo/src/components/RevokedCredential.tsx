"use client";
import { useState } from "react";
import { Verdict, DefenseCard } from "./Terminal";

export default function RevokedCredential() {
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
          <div className="atk-panel__title">🔓 Revoked Credential Attack</div>
          <div className="atk-panel__desc">
            A student whose credential was revoked via 3-of-5 panelist multisig tries to authenticate.
            The backend queries the on-chain bitstring and denies access.
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
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Access Third-Party Service</h2>
              <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                Login using your Verifiable Credential.
              </p>
            </div>

            <div style={{ 
              background: "#f3f4f6", borderRadius: 8, padding: 12, marginBottom: 24, textAlign: "left",
              fontSize: 11, fontFamily: "var(--hk-mono)", color: "#4b5563"
            }}>
              <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>[REVOKED DID LOADED]</div>
              <div>holder: "did:securedid:base:0xExpelled"</div>
              <div>on-chain bitstring: bit #42 is SET</div>
            </div>

            {done && (
              <div style={{ 
                background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: 16, marginBottom: 24,
                color: "#991b1b", fontSize: 13, textAlign: "left"
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Authentication Failed (401)</div>
                <div style={{ fontFamily: "var(--hk-mono)", fontSize: 11 }}>
                  - Revocation status check FAILED<br/>
                  - Credential was revoked at block 18,432,156
                </div>
              </div>
            )}

            <button 
              onClick={submit} 
              disabled={busy || done} 
              style={{ 
                width: "100%", padding: "12px", background: done ? "#d1d5db" : "#f59e0b", color: "#fff", 
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy || done ? "not-allowed" : "pointer"
              }}
            >
              {busy ? "Checking On-Chain Status..." : done ? "Access Denied" : "Login with Revoked DID"}
            </button>
          </div>
        </div>

        {done && (
          <div style={{ marginTop: 40, animation: "atk-verdict-in 0.5s ease" }}>
            <Verdict
              blocked
              title="REVOKED — ACCESS DENIED"
              sub="Even with a valid private key and correctly signed VP, revoked credentials are permanently blocked. The on-chain bitstring provides O(1) real-time revocation checking."
            />
            <DefenseCard items={[
              "2048-bit revocation bitstring stored on-chain for gas-efficient O(1) lookup",
              "Revocation requires 3-of-5 panelist multisig proposal + execution",
              "Immutable audit trail: revocation event logged on Base Sepolia",
            ]} />
          </div>
        )}
      </div>
    </div>
  );
}
