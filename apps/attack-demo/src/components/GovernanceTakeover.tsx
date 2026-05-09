"use client";
import { useState } from "react";
import { Verdict, DefenseCard } from "./Terminal";

export default function GovernanceTakeover() {
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
          <div className="atk-panel__title">🏛️ Governance Takeover Attempt</div>
          <div className="atk-panel__desc">
            A single rogue panelist tries to unilaterally lower the multisig threshold to 1 to gain full control.
            Without reaching 3-of-5 quorum, the proposal expires unexecuted.
          </div>
        </div>
        {done && (
          <button className="atk-launch atk-launch--reset" onClick={reset}>↻ Reset</button>
        )}
      </div>

      <div className="atk-panel__body" style={{ background: "var(--hk-surface2)", padding: "40px" }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <div style={{ background: "#ffffff", borderRadius: 16, padding: 32, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", color: "#111827" }}>
            <div style={{ marginBottom: 24, textAlign: "center" }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Panelist Dashboard</h2>
              <p style={{ fontSize: 13, color: "#6b7280" }}>Manage institution settings and proposals.</p>
            </div>

            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Create Parameter Change Proposal</div>
              
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Target Parameter</label>
                <select disabled style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f3f4f6" }}>
                  <option>Multisig Threshold</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 6 }}>New Value</label>
                <div style={{ position: "relative" }}>
                  <input type="number" value={1} disabled style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }} />
                  <span style={{ position: "absolute", right: -8, top: -8, fontSize: 18 }}>🕵️</span>
                </div>
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>* Attacker attempts to set threshold to 1</div>
              </div>

              {done && (
                <div style={{ 
                  background: "#fef2f2", border: "1px solid #f87171", borderRadius: 8, padding: 16, marginBottom: 16,
                  color: "#991b1b", fontSize: 13, textAlign: "left"
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ PROPOSAL EXPIRED</div>
                  <div style={{ fontFamily: "var(--hk-mono)", fontSize: 11 }}>
                    - Approval count: 1/3 (Quorum NOT reached)<br/>
                    - Time elapsed: 7 days<br/>
                    - Transaction reverted: ProposalExpired()
                  </div>
                </div>
              )}

              <button 
                onClick={submit} 
                disabled={busy || done} 
                style={{ 
                  width: "100%", padding: "12px", background: done ? "#d1d5db" : "#ef4444", color: "#fff", 
                  border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy || done ? "not-allowed" : "pointer"
                }}
              >
                {busy ? "Submitting Proposal..." : done ? "Takeover Failed" : "Submit Malicious Proposal"}
              </button>
            </div>
          </div>
        </div>

        {done && (
          <div style={{ marginTop: 40, animation: "atk-verdict-in 0.5s ease" }}>
            <Verdict
              blocked
              title="TAKEOVER PREVENTED"
              sub="The 3-of-5 multisig threshold prevents any single panelist from unilaterally changing system parameters. Proposals automatically expire after 7 days if quorum is not reached."
            />
            <DefenseCard items={[
              "All governance actions require threshold-of-N multisig approval",
              "Proposals automatically expire after 7 days (PROPOSAL_EXPIRY = 7 days)",
              "Threshold changes are themselves subject to the same multisig approval logic",
            ]} />
          </div>
        )}
      </div>
    </div>
  );
}
