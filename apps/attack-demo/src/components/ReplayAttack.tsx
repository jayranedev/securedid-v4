"use client";
import { useState } from "react";
import { Verdict, DefenseCard } from "./Terminal";

export default function ReplayAttack() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    // Simulate network delay
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
          <div className="atk-panel__title">🔄 Replay Attack — Stale Nonce</div>
          <div className="atk-panel__desc">
            An attacker intercepts a legitimate Verifiable Presentation (VP) from network traffic and tries to log in with it.
            The backend blocks the attempt because the cryptographic nonce has already been consumed or has expired.
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
              <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Connect to Platform</h2>
              <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                Authenticate securely using your Decentralized Identifier (DID).
              </p>
            </div>

            {/* Mock Captured VP Data */}
            <div style={{ 
              background: "#f3f4f6", borderRadius: 8, padding: 12, marginBottom: 24, textAlign: "left",
              fontSize: 11, fontFamily: "var(--hk-mono)", color: "#4b5563"
            }}>
              <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>[CAPTURED PAYLOAD READY]</div>
              <div>nonce: "n_8f3a2b1c"</div>
              <div>holder: "did:securedid:base:0xAarav"</div>
              <div>signature: "0x3045022100..."</div>
            </div>

            {done && (
              <div style={{ 
                background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: 16, marginBottom: 24,
                color: "#991b1b", fontSize: 13, textAlign: "left"
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Authentication Failed (401)</div>
                <div style={{ fontFamily: "var(--hk-mono)", fontSize: 11 }}>
                  - Nonce 'n_8f3a2b1c' has EXPIRED (TTL: 30s)<br/>
                  - Nonce was already CONSUMED
                </div>
              </div>
            )}

            <button 
              onClick={submit} 
              disabled={busy || done} 
              style={{ 
                width: "100%", padding: "12px", background: done ? "#d1d5db" : "#10b981", color: "#fff", 
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy || done ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8
              }}
            >
              {busy ? "Authenticating..." : done ? "Access Denied" : "Login with Captured VP"}
            </button>
          </div>

        </div>

        {done && (
          <div style={{ marginTop: 40, animation: "atk-verdict-in 0.5s ease" }}>
            <Verdict
              blocked
              title="REPLAY BLOCKED"
              sub="Challenge-response nonces are single-use and expire after 30 seconds. Even capturing a valid VP from the wire is useless — it can never be replayed."
            />
            <DefenseCard items={[
              "Each auth challenge generates a cryptographically random, unpredictable nonce",
              "Nonce TTL: 30 seconds — strictly enforced by the backend",
              "One-time consumption: nonce is deleted immediately after its first use",
            ]} />
          </div>
        )}
      </div>
    </div>
  );
}
