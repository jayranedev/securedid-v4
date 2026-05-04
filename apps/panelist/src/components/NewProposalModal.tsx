"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet, getRegistryWrite, computeCommitment } from "@securedid/shared";

type Kind = "enrollment" | "revocation" | "replace" | "changeThreshold" | "addPanelist" | "removePanelist";

export function NewProposalModal({
  registry, panelistCount, threshold, onClose, onCreated,
}: {
  registry: string;
  panelistCount: number;
  threshold: number;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { getSigner } = useWallet();
  const [kind, setKind]             = useState<Kind>("enrollment");
  const [commitment, setCommitment] = useState("");
  // Enrollment builder fields
  const [buildEmail, setBuildEmail]     = useState("");
  const [buildRoll, setBuildRoll]       = useState("");
  const [buildName, setBuildName]       = useState("");
  const [buildDept, setBuildDept]       = useState("");
  const [buildYear, setBuildYear]       = useState(new Date().getFullYear());
  const [buildSecret, setBuildSecret]   = useState("");
  const [builtCommitment, setBuiltCommitment] = useState<string | null>(null);
  const [useBuilder, setUseBuilder]     = useState(true);
  const [computing, setComputing]       = useState(false);

  const [studentAddr, setStudent]   = useState("");
  const [reason, setReason]         = useState("");
  const [slot, setSlot]             = useState(0);
  const [newAddr, setNewAddr]       = useState("");
  const [newThreshold, setNewThreshold] = useState(threshold);
  const [addAddr, setAddAddr]       = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const [busy, setBusy]             = useState(false);
  const [msg, setMsg]               = useState<string | null>(null);
  const [copied, setCopied]         = useState<"commitment" | "secret" | null>(null);

  const builderComplete = !!(buildEmail && buildRoll && buildName && buildDept && buildSecret);

  async function computeAndShow() {
    if (!builderComplete) return;
    setComputing(true);
    setMsg(null);
    try {
      const c = await computeCommitment({ email: buildEmail, roll: buildRoll, name: buildName, department: buildDept, year: buildYear, secret: buildSecret });
      setBuiltCommitment(c);
    } catch (e) {
      setMsg(`✗ Failed to compute commitment: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setComputing(false); }
  }

  function generateSecret() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const s = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    setBuildSecret(s);
    setBuiltCommitment(null);
  }

  function copyText(text: string, which: "commitment" | "secret") {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  async function submit() {
    setMsg(null);
    try {
      let finalCommitment = commitment;
      if (kind === "enrollment") {
        if (useBuilder) {
          if (!builderComplete) throw new Error("Fill in all fields (email, roll, name, department, secret)");
          setMsg("Computing commitment…");
          finalCommitment = await computeCommitment({ email: buildEmail, roll: buildRoll, name: buildName, department: buildDept, year: buildYear, secret: buildSecret });
          setBuiltCommitment(finalCommitment);
          setMsg(null);
        }
        if (!ethers.isHexString(finalCommitment, 32)) throw new Error("Commitment must be a 32-byte hex string (0x-prefixed, 66 chars)");
      } else if (kind === "revocation") {
        if (!ethers.isAddress(studentAddr)) throw new Error("Invalid student address");
        if (!reason.trim()) throw new Error("Reason is required");
        setMsg("Checking student on-chain…");
        const { getRegistryRead } = await import("@securedid/shared");
        const reg = getRegistryRead(registry);
        const cid = await reg.getCID(studentAddr) as string;
        if (!cid || cid.length === 0) throw new Error("This address has no active DID on this registry. Make sure the student's DID has been fully issued.");
        setMsg(null);
      } else if (kind === "replace") {
        if (!ethers.isAddress(newAddr)) throw new Error("Invalid new panelist address");
        if (slot < 0 || slot >= panelistCount) throw new Error(`Slot must be 0..${panelistCount - 1}`);
      } else if (kind === "changeThreshold") {
        if (newThreshold < 1 || newThreshold > panelistCount) throw new Error(`Threshold must be between 1 and ${panelistCount}`);
      } else if (kind === "addPanelist") {
        if (!ethers.isAddress(addAddr)) throw new Error("Invalid panelist address");
        if (panelistCount >= 10) throw new Error("Maximum 10 panelists already reached");
      } else if (kind === "removePanelist") {
        if (!ethers.isAddress(removeAddr)) throw new Error("Invalid panelist address");
        if (panelistCount <= threshold) throw new Error(`Cannot remove: panelist count (${panelistCount}) must exceed threshold (${threshold})`);
      }

      setBusy(true);
      const signer = await getSigner();
      const reg = await getRegistryWrite(registry, signer);

      let tx: ethers.ContractTransactionResponse;
      if (kind === "enrollment")         tx = await reg.proposeEnrollment(finalCommitment);
      else if (kind === "revocation")    tx = await reg.proposeRevocation(studentAddr, reason);
      else if (kind === "replace")       tx = await reg.proposeReplacePanelist(slot, newAddr);
      else if (kind === "changeThreshold") tx = await reg.proposeChangeThreshold(newThreshold);
      else if (kind === "addPanelist")   tx = await reg.proposeAddPanelist(addAddr);
      else                               tx = await reg.proposeRemovePanelist(removeAddr);

      setMsg(`Broadcasting — tx ${tx.hash.slice(0, 12)}…`);
      await tx.wait();
      setMsg("✓ Proposal submitted");
      await onCreated();
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    } finally { setBusy(false); }
  }

  const KINDS: [Kind, string, string][] = [
    ["enrollment",      "Enrollment",        "Pre-authorize a student commitment"],
    ["revocation",      "Revocation",        "Revoke a student's credential"],
    ["replace",         "Replace panelist",  "Swap a panelist slot"],
    ["changeThreshold", "Change threshold",  "Change the vote threshold"],
    ["addPanelist",     "Add panelist",      "Add a new panelist"],
    ["removePanelist",  "Remove panelist",   "Remove an existing panelist"],
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="sd-card sd-card--pad"
        style={{ maxWidth: 560, width: "100%", display: "flex", flexDirection: "column", gap: 20, boxShadow: "var(--shadow-lg)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="sd-card-title">New Proposal</div>
          <button onClick={onClose} className="sd-btn sd-btn--ghost sd-btn--sm" style={{ fontSize: 20, lineHeight: 1, padding: "0 8px" }}>×</button>
        </div>

        {/* Proposal type selector */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {KINDS.map(([k, label, hint]) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              style={{
                padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid",
                borderColor: kind === k ? "var(--accent)" : "var(--border-default)",
                background: kind === k ? "var(--accent-50)" : "var(--bg-surface-0)",
                textAlign: "left", cursor: "pointer",
              }}>
              <div style={{ font: "var(--fw-semibold) 12px/1.2 var(--font-sans)", color: kind === k ? "var(--accent-700)" : "var(--fg-1)" }}>{label}</div>
              <div style={{ font: "var(--fw-regular) 10px/1.3 var(--font-sans)", color: "var(--fg-4)", marginTop: 3 }}>{hint}</div>
            </button>
          ))}
        </div>

        {/* Enrollment */}
        {kind === "enrollment" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setUseBuilder(true)}
                style={{ flex: 1, padding: "8px", borderRadius: "var(--radius-md)", border: "1px solid", cursor: "pointer",
                  borderColor: useBuilder ? "var(--accent)" : "var(--border-default)",
                  background: useBuilder ? "var(--accent-50)" : "var(--bg-surface-0)",
                  font: "var(--fw-medium) 12px/1 var(--font-sans)", color: useBuilder ? "var(--accent-700)" : "var(--fg-2)" }}>
                Build commitment
              </button>
              <button type="button" onClick={() => setUseBuilder(false)}
                style={{ flex: 1, padding: "8px", borderRadius: "var(--radius-md)", border: "1px solid", cursor: "pointer",
                  borderColor: !useBuilder ? "var(--accent)" : "var(--border-default)",
                  background: !useBuilder ? "var(--accent-50)" : "var(--bg-surface-0)",
                  font: "var(--fw-medium) 12px/1 var(--font-sans)", color: !useBuilder ? "var(--accent-700)" : "var(--fg-2)" }}>
                Paste raw bytes32
              </button>
            </div>

            {useBuilder && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Email">
                    <input value={buildEmail} onChange={(e) => { setBuildEmail(e.target.value); setBuiltCommitment(null); }} placeholder="student@college.edu" className="sd-input" />
                  </Field>
                  <Field label="Roll number">
                    <input value={buildRoll} onChange={(e) => { setBuildRoll(e.target.value); setBuiltCommitment(null); }} placeholder="CS2024-042" className="sd-input" />
                  </Field>
                  <Field label="Full name">
                    <input value={buildName} onChange={(e) => { setBuildName(e.target.value); setBuiltCommitment(null); }} placeholder="Jane Doe" className="sd-input" />
                  </Field>
                  <Field label="Department">
                    <input value={buildDept} onChange={(e) => { setBuildDept(e.target.value); setBuiltCommitment(null); }} placeholder="Computer Engineering" className="sd-input" />
                  </Field>
                  <Field label="Year">
                    <input type="number" value={buildYear} onChange={(e) => { setBuildYear(Number(e.target.value)); setBuiltCommitment(null); }} className="sd-input" />
                  </Field>
                  <Field label="Secret">
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={buildSecret} onChange={(e) => { setBuildSecret(e.target.value); setBuiltCommitment(null); }}
                        placeholder="passphrase…" className="sd-input sd-input--mono" style={{ flex: 1 }} />
                      <button type="button" onClick={generateSecret} className="sd-btn sd-btn--secondary sd-btn--sm" title="Generate random secret">⟳</button>
                    </div>
                  </Field>
                </div>

                {buildSecret && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--yellow-50, #fefce8)", border: "1px solid var(--yellow-200, #fef08a)", fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: "var(--yellow-800, #854d0e)", marginBottom: 4 }}>Share this secret with the student (email, WhatsApp, etc.)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", color: "var(--fg-1)", wordBreak: "break-all" }}>
                      <span style={{ flex: 1 }}>{buildSecret}</span>
                      <button type="button" onClick={() => copyText(buildSecret, "secret")} className="sd-btn sd-btn--secondary sd-btn--sm">
                        {copied === "secret" ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}

                {builderComplete && !builtCommitment && (
                  <button type="button" onClick={computeAndShow} disabled={computing}
                    className="sd-btn sd-btn--secondary" style={{ justifyContent: "center" }}>
                    {computing ? "Computing…" : "Compute commitment →"}
                  </button>
                )}

                {builtCommitment && (
                  <Field label="Commitment (ready to submit)">
                    <div style={{ display: "flex", gap: 6 }}>
                      <input readOnly value={builtCommitment} className="sd-input sd-input--mono" style={{ flex: 1, color: "var(--fg-3)", fontSize: 11 }} />
                      <button type="button" onClick={() => copyText(builtCommitment, "commitment")} className="sd-btn sd-btn--secondary sd-btn--sm">
                        {copied === "commitment" ? "✓" : "Copy"}
                      </button>
                    </div>
                  </Field>
                )}
              </div>
            )}

            {!useBuilder && (
              <Field label="Commitment (bytes32)" hint="Paste the keccak256 commitment computed by the student">
                <input value={commitment} onChange={(e) => setCommitment(e.target.value.trim())}
                  placeholder="0x…" className="sd-input sd-input--mono" />
              </Field>
            )}
          </div>
        )}

        {/* Revocation */}
        {kind === "revocation" && (
          <>
            <Field label="Student address">
              <input value={studentAddr} onChange={(e) => setStudent(e.target.value.trim())}
                placeholder="0x…" className="sd-input sd-input--mono" />
            </Field>
            <Field label="Reason">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                rows={3} placeholder="e.g. Graduated 2026" className="sd-textarea" />
            </Field>
          </>
        )}

        {/* Replace panelist */}
        {kind === "replace" && (
          <>
            <Field label="Slot to replace">
              <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className="sd-select">
                {Array.from({ length: panelistCount }).map((_, i) => (
                  <option key={i} value={i}>Slot {i}</option>
                ))}
              </select>
            </Field>
            <Field label="New panelist address">
              <input value={newAddr} onChange={(e) => setNewAddr(e.target.value.trim())}
                placeholder="0x…" className="sd-input sd-input--mono" />
            </Field>
          </>
        )}

        {/* Change threshold */}
        {kind === "changeThreshold" && (
          <Field label="New threshold" hint={`Current: ${threshold}-of-${panelistCount}. Must be between 1 and ${panelistCount}.`}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="number" min={1} max={panelistCount} value={newThreshold}
                onChange={(e) => setNewThreshold(Math.max(1, Math.min(panelistCount, Number(e.target.value))))}
                className="sd-input" style={{ width: 80 }} />
              <span style={{ fontSize: 13, color: "var(--fg-3)" }}>of {panelistCount} panelists</span>
            </div>
          </Field>
        )}

        {/* Add panelist */}
        {kind === "addPanelist" && (
          <Field label="New panelist address" hint={`Current panelists: ${panelistCount}/10`}>
            <input value={addAddr} onChange={(e) => setAddAddr(e.target.value.trim())}
              placeholder="0x…" className="sd-input sd-input--mono" />
          </Field>
        )}

        {/* Remove panelist */}
        {kind === "removePanelist" && (
          <Field label="Panelist address to remove"
            hint={`Panelist count (${panelistCount}) must remain above threshold (${threshold}) after removal.`}>
            <input value={removeAddr} onChange={(e) => setRemoveAddr(e.target.value.trim())}
              placeholder="0x…" className="sd-input sd-input--mono" />
          </Field>
        )}

        {msg && (
          <div className="sd-alert sd-alert--info" style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>{msg}</div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="sd-btn sd-btn--secondary" style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="sd-btn sd-btn--primary" style={{ flex: 1, justifyContent: "center" }}>
            {busy ? "Submitting…" : "Submit proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="sd-field">
      <label className="sd-label">{label}</label>
      {hint && <div className="sd-help">{hint}</div>}
      {children}
    </div>
  );
}
