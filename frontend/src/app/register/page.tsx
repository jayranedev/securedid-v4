"use client";
import { useState } from "react";
import { register } from "@/lib/api";

const DEPARTMENTS = ["CS", "IT", "EC", "ME", "CIVIL"];
const YEARS = [1, 2, 3, 4];

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name: "", email: "", roll_number: "",
    department: "CS", year: 1, secret_key: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ request_id?: string; message?: string } | null>(null);

  function set(k: string, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await register({ ...form, year: Number(form.year) });
      setResult(res);
      setStatus("success");
    } catch (err: unknown) {
      setResult({ message: err instanceof Error ? err.message : "Registration failed" });
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto text-3xl">✓</div>
        <h2 className="text-2xl font-bold text-slate-800">Registration Submitted</h2>
        <p className="text-slate-500">Your request is pending panelist approval (3-of-5 Shamir threshold).</p>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
          <p className="text-xs text-gray-500 font-mono">Request ID</p>
          <p className="font-mono text-sm break-all mt-1">{result?.request_id}</p>
        </div>
        <p className="text-sm text-gray-500">
          Once approved, your DID and Verifiable Credential will be available in your wallet.
          You&apos;ll receive your private key — import it into the{" "}
          <a href="/wallet" className="text-indigo-600 underline">wallet page</a>.
        </p>
        <button onClick={() => { setStatus("idle"); setForm({ full_name: "", email: "", roll_number: "", department: "CS", year: 1, secret_key: "" }); }}
          className="text-sm text-gray-500 underline">
          Submit another registration
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Student Registration</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Credentials are verified against the authorized student CSV before DID issuance.
        </p>
      </div>

      {status === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          ✗ {result?.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <Field label="Full Name *" required>
          <input type="text" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
            placeholder="Dr. Priya Sharma" className={inputCls} />
        </Field>

        <Field label="Email Address *" required>
          <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)}
            placeholder="student@dbce.edu" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Roll Number *" required>
            <input type="text" required value={form.roll_number} onChange={(e) => set("roll_number", e.target.value)}
              placeholder="22CS001" className={inputCls} />
          </Field>
          <Field label="Year *" required>
            <select value={form.year} onChange={(e) => set("year", Number(e.target.value))} className={inputCls}>
              {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Department *" required>
          <select value={form.department} onChange={(e) => set("department", e.target.value)} className={inputCls}>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Secret Key *" hint="Provided by the college at enrollment">
          <input type="password" required value={form.secret_key} onChange={(e) => set("secret_key", e.target.value)}
            placeholder="Your enrollment secret key" className={inputCls} />
        </Field>

        <button type="submit" disabled={status === "loading"}
          className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-60">
          {status === "loading" ? "Submitting…" : "Submit Registration Request"}
        </button>

        <p className="text-xs text-center text-gray-400">
          Your request will be queued for 3-of-5 panelist multisig approval.
        </p>
      </form>
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";

function Field({ label, children, hint, required: req }: {
  label: string; children: React.ReactNode; hint?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">
        {label} {req && <span className="text-red-400">*</span>}
        {hint && <span className="text-gray-400 font-normal"> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}
