"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, AddressPill } from "@securedid/shared";
import { getFactoryWrite, isNameTaken, FACTORY_ADDRESS } from "@/lib/factory";
import { Stepper } from "@/components/Stepper";

type Step = 1 | 2 | 3;

interface Form {
  name: string;
  website: string;
  panelists: [string, string, string, string, string];
}

const EMPTY: Form = { name: "", website: "", panelists: ["", "", "", "", ""] };

export default function CreateRegistry() {
  const router = useRouter();
  const { address, getSigner } = useWallet();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Form>(EMPTY);

  const [nameError, setNameError]     = useState<string | null>(null);
  const [checkingName, setChecking]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [txHash, setTxHash]           = useState<string | null>(null);
  const [newRegistry, setNewReg]      = useState<string | null>(null);
  const [submitError, setSubmitErr]   = useState<string | null>(null);

  const step1Valid = form.name.trim().length >= 2 && !nameError && !checkingName;

  async function checkName() {
    const n = form.name.trim();
    if (n.length < 2) { setNameError("Name must be at least 2 characters"); return; }
    setChecking(true); setNameError(null);
    try {
      const taken = await isNameTaken(n);
      if (taken) setNameError("This name is already registered on-chain");
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Check failed");
    } finally { setChecking(false); }
  }

  const panelistErrors = form.panelists.map((p, i) => {
    if (!p.trim()) return "required";
    if (!/^0x[a-fA-F0-9]{40}$/.test(p.trim())) return "invalid address";
    const dup = form.panelists.findIndex((q, j) => j !== i && q.trim().toLowerCase() === p.trim().toLowerCase());
    if (dup !== -1) return "duplicate";
    return null;
  });
  const step2Valid = panelistErrors.every((e) => e === null);

  async function submit() {
    setSubmitErr(null); setSubmitting(true);
    try {
      const signer = await getSigner();
      const factory = await getFactoryWrite(signer);
      const panelists = form.panelists.map((p) => p.trim());
      const tx = await factory.createRegistry(panelists, form.name.trim(), form.website.trim());
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      for (const log of receipt.logs as { topics: string[]; data: string }[]) {
        try {
          const parsed = factory.interface.parseLog(log);
          if (parsed?.name === "RegistryCreated") { setNewReg((parsed.args[0] as string).toLowerCase()); break; }
        } catch { /* skip */ }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitErr(msg.split("\n")[0].slice(0, 260));
    } finally { setSubmitting(false); }
  }

  if (newRegistry) {
    return (
      <div className="sd-page sd-page--narrow" style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--success-100)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "var(--success)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h1 className="sd-page-title">Registry deployed</h1>
        <p className="sd-page-sub" style={{ margin: "8px auto 0" }}>
          <strong>{form.name}</strong> is live on Base Sepolia.
        </p>
        <div className="sd-card sd-card--pad" style={{ textAlign: "left", marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <Row label="Registry address"><AddressPill address={newRegistry} /></Row>
          {txHash && (
            <Row label="Transaction">
              <a href={explorerTx(txHash)} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>
                {txHash.slice(0, 12)}…
              </a>
            </Row>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
          <button onClick={() => router.push("/")} className="sd-btn sd-btn--primary sd-btn--lg">Go to dashboard</button>
          <button onClick={() => { setForm(EMPTY); setStep(1); setNewReg(null); setTxHash(null); }} className="sd-btn sd-btn--secondary sd-btn--lg">Deploy another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sd-page sd-page--narrow">
      <div className="sd-page-header">
        <div className="sd-eyebrow">Factory</div>
        <h1 className="sd-page-title">Create a new DID Registry</h1>
        <p className="sd-page-sub">Deploy a sovereign, per-institution registry. Governance is 3-of-5 multisig — no owner, no single controller.</p>
      </div>

      <Stepper current={step} />

      {!address && (
        <div className="sd-alert sd-alert--warn" style={{ marginBottom: 24 }}>
          Connect your wallet to continue.
        </div>
      )}

      {address && !FACTORY_ADDRESS && (
        <div className="sd-alert sd-alert--danger" style={{ marginBottom: 24 }}>
          NEXT_PUBLIC_FACTORY_ADDRESS is not configured.
        </div>
      )}

      {address && FACTORY_ADDRESS && (
        <div className="sd-card sd-card--pad">
          {step === 1 && (
            <Step1 form={form} setForm={setForm} nameError={nameError} setNameError={setNameError}
              checking={checkingName} checkName={checkName} onNext={() => step1Valid && setStep(2)} valid={step1Valid} />
          )}
          {step === 2 && (
            <Step2 form={form} setForm={setForm} errors={panelistErrors} selfAddress={address}
              onBack={() => setStep(1)} onNext={() => step2Valid && setStep(3)} valid={step2Valid} />
          )}
          {step === 3 && (
            <Step3 form={form} onBack={() => setStep(2)} onSubmit={submit}
              submitting={submitting} txHash={txHash} error={submitError} />
          )}
        </div>
      )}
    </div>
  );
}

function Step1({ form, setForm, nameError, setNameError, checking, checkName, onNext, valid }: {
  form: Form; setForm: (f: Form) => void;
  nameError: string | null; setNameError: (e: string | null) => void;
  checking: boolean; checkName: () => void;
  onNext: () => void; valid: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="sd-card-title">Institution details</div>
        <div className="sd-card-sub" style={{ marginTop: 4 }}>The name is enforced unique on-chain. Choose something stable and recognizable.</div>
      </div>
      <Field label="Institution name" required error={nameError}>
        <input className={`sd-input${nameError ? " sd-input--error" : ""}`} type="text" value={form.name}
          onChange={(e) => { setForm({ ...form, name: e.target.value }); setNameError(null); }}
          onBlur={checkName} placeholder="Don Bosco College of Engineering" />
        {checking && <div className="sd-help">Checking availability…</div>}
      </Field>
      <Field label="Website" hint="Optional. Shown on the explorer and dashboard.">
        <input className="sd-input" type="url" value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://dbce.edu.in" />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <button disabled={!valid} onClick={onNext} className="sd-btn sd-btn--primary">Next →</button>
      </div>
    </div>
  );
}

function Step2({ form, setForm, errors, selfAddress, onBack, onNext, valid }: {
  form: Form; setForm: (f: Form) => void;
  errors: (string | null)[];
  selfAddress: string;
  onBack: () => void; onNext: () => void; valid: boolean;
}) {
  const update = (i: number, val: string) => {
    const next = [...form.panelists] as Form["panelists"];
    next[i] = val;
    setForm({ ...form, panelists: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="sd-card-title">Panelists</div>
        <div className="sd-card-sub" style={{ marginTop: 4 }}>Five distinct wallet addresses. A 3-of-5 threshold is required for all governance actions.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {form.panelists.map((p, i) => (
          <PanelistRow key={i} index={i} value={p} error={errors[i]}
            onChange={(v) => update(i, v)}
            onUseSelf={i === 0 ? () => update(i, selfAddress) : undefined} />
        ))}
      </div>
      <div className="sd-alert sd-alert--info" style={{ fontSize: 12 }}>
        <div>
          <div>⚠ Each panelist must hold their own keys. If 3 keys are lost the registry becomes frozen.</div>
          <div style={{ marginTop: 4 }}>✓ Panelists can be replaced individually through a 3-of-5 governance vote.</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={onBack} className="sd-btn sd-btn--secondary">← Back</button>
        <button disabled={!valid} onClick={onNext} className="sd-btn sd-btn--primary">Next →</button>
      </div>
    </div>
  );
}

function PanelistRow({ index, value, error, onChange, onUseSelf }: {
  index: number; value: string; error: string | null;
  onChange: (v: string) => void; onUseSelf?: () => void;
}) {
  const valid = value && !error;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--bg-surface-2)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>
          {index + 1}
        </span>
        <div style={{ flex: 1, position: "relative" }}>
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0x…"
            className={`sd-input sd-input--mono${error && error !== "required" ? " sd-input--error" : ""}`}
            style={valid ? { borderColor: "var(--success)", color: "var(--fg-1)" } : undefined} />
          {valid && (
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--success)", fontSize: 14 }}>✓</span>
          )}
        </div>
        {onUseSelf && (
          <button onClick={onUseSelf} className="sd-btn sd-btn--ghost sd-btn--sm" style={{ whiteSpace: "nowrap" }}>Use my wallet</button>
        )}
      </div>
      {error && error !== "required" && (
        <div className="sd-err" style={{ marginLeft: 36, marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}

function Step3({ form, onBack, onSubmit, submitting, txHash, error }: {
  form: Form; onBack: () => void; onSubmit: () => void;
  submitting: boolean; txHash: string | null; error: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="sd-card-title">Review & deploy</div>
        <div className="sd-card-sub" style={{ marginTop: 4 }}>Double-check the details. This will submit one transaction from your wallet to the SecureDID Factory.</div>
      </div>
      <div style={{ background: "var(--bg-surface-1)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Row label="Name"><span style={{ color: "var(--fg-1)", fontWeight: 500 }}>{form.name}</span></Row>
        <Row label="Website"><span style={{ color: "var(--fg-2)" }}>{form.website || <em style={{ color: "var(--fg-4)" }}>none</em>}</span></Row>
        <Row label="Threshold"><span style={{ color: "var(--fg-1)", fontWeight: 500 }}>3-of-5</span></Row>
      </div>
      <div>
        <div style={{ font: "var(--fw-semibold) 11px/1 var(--font-sans)", color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Panelists</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {form.panelists.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 20, fontSize: 12, color: "var(--fg-4)" }}>#{i + 1}</span>
              <AddressPill address={p} head={10} tail={6} />
            </div>
          ))}
        </div>
      </div>
      {error && (
        <div className="sd-alert sd-alert--danger">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>{error}</div>
        </div>
      )}
      {txHash && !error && (
        <div className="sd-alert sd-alert--warn">
          <span>Awaiting confirmation… </span>
          <a href={explorerTx(txHash)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            {txHash.slice(0, 14)}…
          </a>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <button onClick={onBack} disabled={submitting} className="sd-btn sd-btn--secondary">← Back</button>
        <button onClick={onSubmit} disabled={submitting} className="sd-btn sd-btn--primary sd-btn--lg">
          {submitting ? "Deploying…" : "Deploy registry"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string | null; children: React.ReactNode;
}) {
  return (
    <div className="sd-field">
      <label className="sd-label">
        {label}{required && <span style={{ color: "var(--danger)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {error && <div className="sd-err">{error}</div>}
      {hint && !error && <div className="sd-help">{hint}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--fg-3)", fontSize: 13 }}>{label}</span>
      {children}
    </div>
  );
}

function explorerTx(hash: string) {
  return `https://base-sepolia.blockscout.com/tx/${hash}`;
}
