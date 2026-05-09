"use client";
import { useState } from "react";
import { Verdict, DefenseCard } from "./Terminal";

export default function IdentityFraud() {
  const [f, setF] = useState({
    email: "aarav@dbce.ac.in", roll: "4CB21CS045", name: "Aarav Sharma", department: "CSE", year: 2025, secret: "password123"
  });
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
          <div className="atk-panel__title">🎭 Identity Fraud — Fake Registration</div>
          <div className="atk-panel__desc">
            An attacker steals a student&apos;s personal details and tries to register on their behalf.
            However, they do not know the offline secret shared between the student and the panelist.
          </div>
        </div>
        {done && (
          <button className="atk-launch atk-launch--reset" onClick={reset}>↻ Reset</button>
        )}
      </div>
      
      <div className="atk-panel__body" style={{ background: "var(--hk-surface2)", padding: "40px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          
          <div style={{ background: "#ffffff", borderRadius: 16, padding: 32, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", color: "#111827" }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Student Registration</h2>
              <p style={{ fontSize: 13, color: "#6b7280" }}>Register your decentralized identity for Base University.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <Field label="Email (Stolen)" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
              <Field label="Roll Number (Stolen)" value={f.roll} onChange={(v) => setF({ ...f, roll: v })} />
              <Field label="Full Name (Stolen)" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
              <Field label="Department (Stolen)" value={f.department} onChange={(v) => setF({ ...f, department: v })} />
              <Field label="Year (Stolen)" value={String(f.year)} onChange={(v) => setF({ ...f, year: Number(v) })} />
              <div style={{ position: "relative" }}>
                <Field label="Secret Key (Guessed)" value={f.secret} onChange={(v) => setF({ ...f, secret: v })} />
                <span style={{ position: "absolute", right: -8, top: -8, fontSize: 18 }}>🕵️</span>
              </div>
            </div>

            {done && (
              <div style={{ 
                background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: 16, marginBottom: 24,
                color: "#991b1b", fontSize: 13, fontFamily: "var(--hk-mono)"
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ TRANSACTION REVERTED: NotAuthorized()</div>
                The computed commitment hash <b>(0x7a3f...b91d)</b> does not match the authorized commitment on-chain <b>(0xe4c1...2f8a)</b>. Registration blocked.
              </div>
            )}

            <button 
              onClick={submit} 
              disabled={busy || done} 
              style={{ 
                width: "100%", padding: "12px", background: done ? "#d1d5db" : "#3b82f6", color: "#fff", 
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy || done ? "not-allowed" : "pointer" 
              }}
            >
              {busy ? "Submitting to Blockchain..." : done ? "Registration Failed" : "Submit Registration (Attack)"}
            </button>
          </div>

        </div>

        {done && (
          <div style={{ marginTop: 40, animation: "atk-verdict-in 0.5s ease" }}>
            <Verdict
              blocked
              title="ATTACK BLOCKED"
              sub="The enrollment commitment scheme prevents registration with incorrect secret keys. Even with stolen personal data, the attacker cannot compute the correct commitment hash to pass the on-chain mapping check."
            />
            <DefenseCard items={[
              "Enrollment commitment = keccak256(SALT + student_fields + sha256(secret_key))",
              "Only panelist-authorized commitments are accepted by the smart contract",
              "Wrong secret key → wrong hash → transaction reverts with NotAuthorized()",
            ]} />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 6 }}>{label}</label>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        style={{ 
          width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13,
          background: "#f9fafb", color: "#111827", outline: "none"
        }}
      />
    </div>
  );
}
