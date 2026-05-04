"use client";

import { useState, useRef } from "react";
import { useWallet, getRegistryWrite, computeCommitment, EnrollmentFields } from "@securedid/shared";

interface Row extends EnrollmentFields {
  commitment: string;
  txStatus: "idle" | "ok" | "err";
  txError?: string;
}

type Step = "upload" | "review" | "submit";

export function BulkEnrollModal({ registry, onClose, onDone }: {
  registry: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { getSigner } = useWallet();
  const [step, setStep]           = useState<Step>("upload");
  const [csvText, setCsvText]     = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows]           = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress]   = useState({ done: 0, total: 0, errors: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  function parseLine(line: string): string[] {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    out.push(cur.trim());
    return out;
  }

  async function parseAndGenerate(text: string) {
    setParseError(null);
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { setParseError("CSV needs a header row + at least one data row"); return; }

    const header = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ""));
    const required = ["email", "roll", "name", "department", "year"];
    const missing = required.filter((k) => !header.includes(k));
    if (missing.length) { setParseError(`Missing columns: ${missing.join(", ")}`); return; }

    const get = (cols: string[], key: string) => cols[header.indexOf(key)] ?? "";

    const newRows: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      if (cols.every((c) => !c)) continue;
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const fields: EnrollmentFields = {
        email:      get(cols, "email"),
        roll:       get(cols, "roll"),
        name:       get(cols, "name"),
        department: get(cols, "department"),
        year:       Number(get(cols, "year")) || new Date().getFullYear(),
        secret,
      };
      const commitment = await computeCommitment(fields);
      newRows.push({ ...fields, commitment, txStatus: "idle" });
    }

    if (!newRows.length) { setParseError("No valid rows found"); return; }
    setRows(newRows);
    setStep("review");
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string ?? "";
      setCsvText(text);
      parseAndGenerate(text);
    };
    reader.readAsText(file);
  }

  function downloadCSV() {
    const header = "email,roll,name,department,year,secret,commitment";
    const body = rows.map((r) =>
      [r.email, r.roll, r.name, r.department, r.year, r.secret, r.commitment]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "students-with-secrets.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function submitAll() {
    setSubmitting(true);
    setStep("submit");
    const total = rows.length;
    setProgress({ done: 0, total, errors: 0 });
    let errors = 0;
    try {
      const signer = await getSigner();
      const reg    = await getRegistryWrite(registry, signer);
      for (let i = 0; i < rows.length; i++) {
        try {
          const tx = await reg.proposeEnrollment(rows[i].commitment);
          await tx.wait();
          setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, txStatus: "ok" } : r));
        } catch (e) {
          errors++;
          const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : String(e);
          setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, txStatus: "err", txError: msg } : r));
        }
        setProgress({ done: i + 1, total, errors });
      }
    } catch { /* signer rejected */ }
    finally { setSubmitting(false); await onDone(); }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      onClick={!submitting ? onClose : undefined}
    >
      <div
        className="sd-card sd-card--pad"
        style={{ maxWidth: 680, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 20, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div className="sd-card-title">Bulk enrollment</div>
            <div className="sd-card-sub" style={{ marginTop: 2 }}>
              {step === "upload"  && "Upload a CSV with student details — secrets are generated automatically."}
              {step === "review"  && `${rows.length} students ready. Download the secrets sheet, then submit proposals.`}
              {step === "submit"  && `Submitting ${progress.done} / ${progress.total} proposals…`}
            </div>
          </div>
          {!submitting && (
            <button onClick={onClose} className="sd-btn sd-btn--ghost sd-btn--sm" style={{ fontSize: 20, lineHeight: 1, padding: "0 8px" }}>×</button>
          )}
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: 0, flexShrink: 0 }}>
          {(["upload", "review", "submit"] as Step[]).map((s, i) => {
            const done = ["upload", "review", "submit"].indexOf(step) > i;
            const active = step === s;
            return (
              <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", height: 3, borderRadius: 2, background: done || active ? "var(--accent)" : "var(--border-subtle)" }} />
                <span style={{ fontSize: 10, color: active ? "var(--accent)" : done ? "var(--fg-3)" : "var(--fg-4)", fontWeight: active ? 600 : 400 }}>
                  {["1 · Upload", "2 · Review", "3 · Submit"][i]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step: upload */}
        {step === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-surface-1)", fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
              Required columns: <strong>email, roll, name, department, year</strong>
            </div>

            {/* File drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: "2px dashed var(--border-default)", borderRadius: "var(--radius-md)", padding: "28px 20px", textAlign: "center", cursor: "pointer", color: "var(--fg-3)", fontSize: 13, transition: "border-color var(--dur-fast)" }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
              <div>Drop a <code>.csv</code> file here, or click to browse</div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            <div style={{ textAlign: "center", fontSize: 11, color: "var(--fg-4)" }}>— or paste CSV text below —</div>

            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={6}
              placeholder={"email,roll,name,department,year\njane@college.edu,CS2024-001,Jane Doe,Computer Engineering,2024"}
              className="sd-textarea sd-input--mono"
              style={{ fontSize: 12, resize: "vertical" }}
            />

            {parseError && (
              <div className="sd-alert sd-alert--danger" style={{ fontSize: 12 }}>{parseError}</div>
            )}

            <button onClick={() => parseAndGenerate(csvText)} className="sd-btn sd-btn--primary" style={{ justifyContent: "center" }}>
              Parse & generate secrets →
            </button>
          </div>
        )}

        {/* Step: review */}
        {step === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--yellow-50, #fefce8)", border: "1px solid var(--yellow-200, #fef08a)", fontSize: 12, color: "var(--yellow-800, #854d0e)" }}>
              <strong>Download the secrets sheet first</strong> — secrets are generated only in this session. Once you close the modal they cannot be recovered.
            </div>

            {/* Scrollable table */}
            <div style={{ overflow: "auto", flex: 1, borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <table className="sd-table" style={{ width: "100%", fontSize: 11 }}>
                <thead>
                  <tr>
                    {["Email", "Roll", "Name", "Dept", "Year", "Secret (share this)", "Commitment"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: "6px 10px" }}>{r.email}</td>
                      <td style={{ padding: "6px 10px" }}>{r.roll}</td>
                      <td style={{ padding: "6px 10px" }}>{r.name}</td>
                      <td style={{ padding: "6px 10px" }}>{r.department}</td>
                      <td style={{ padding: "6px 10px" }}>{r.year}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{r.secret}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", color: "var(--fg-4)" }}>{r.commitment.slice(0, 14)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <button onClick={() => setStep("upload")} className="sd-btn sd-btn--secondary" style={{ justifyContent: "center" }}>← Back</button>
              <button onClick={downloadCSV} className="sd-btn sd-btn--secondary" style={{ flex: 1, justifyContent: "center" }}>
                ⬇ Download students-with-secrets.csv
              </button>
              <button onClick={submitAll} className="sd-btn sd-btn--primary" style={{ flex: 1, justifyContent: "center" }}>
                Submit {rows.length} proposals →
              </button>
            </div>

            <div style={{ fontSize: 11, color: "var(--fg-4)", textAlign: "center" }}>
              You&apos;ll sign {rows.length} MetaMask transaction{rows.length !== 1 ? "s" : ""} sequentially.
            </div>
          </div>
        )}

        {/* Step: submit */}
        {step === "submit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
            {/* Overall progress */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg-3)", marginBottom: 8 }}>
                <span>{progress.done} of {progress.total} proposals submitted</span>
                {progress.errors > 0 && <span style={{ color: "var(--red-600, #dc2626)" }}>{progress.errors} error{progress.errors > 1 ? "s" : ""}</span>}
              </div>
              <div className="sd-progress">
                <div className={`sd-progress__fill${!submitting && progress.errors === 0 ? " sd-progress--success" : ""}`}
                  style={{ width: `${pct}%`, transition: "width 0.3s ease" }} />
              </div>
            </div>

            {/* Per-row status */}
            <div style={{ overflow: "auto", flex: 1, borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <table className="sd-table" style={{ width: "100%", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 10px" }}>Student</th>
                    <th style={{ padding: "8px 10px" }}>Roll</th>
                    <th style={{ padding: "8px 10px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: "6px 10px" }}>{r.name}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)" }}>{r.roll}</td>
                      <td style={{ padding: "6px 10px" }}>
                        {r.txStatus === "idle" && <span style={{ color: "var(--fg-4)" }}>Waiting…</span>}
                        {r.txStatus === "ok"   && <span style={{ color: "var(--green-600, #16a34a)" }}>✓ Submitted</span>}
                        {r.txStatus === "err"  && <span style={{ color: "var(--red-600, #dc2626)" }} title={r.txError}>✗ Failed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!submitting && (
              <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                <button onClick={downloadCSV} className="sd-btn sd-btn--secondary" style={{ flex: 1, justifyContent: "center" }}>
                  ⬇ Download secrets CSV
                </button>
                <button onClick={onClose} className="sd-btn sd-btn--primary" style={{ flex: 1, justifyContent: "center" }}>Done</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
