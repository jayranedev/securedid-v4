"use client";
/**
 * M5 — Student wallet page.
 * Stores identity in IndexedDB (v4 upgrade).
 * Supports: import from backend response, export JSON, download PDF card,
 *           manage access grants, session history, data update request.
 */
import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet";
import CredentialCard from "@/components/CredentialCard";
import { getActiveGrants, revokeGrant, getSessions, submitUpdateRequest, createAccessGrant, type AccessGrant } from "@/lib/api";
import type { WalletIdentity } from "@/lib/wallet";

export default function WalletPage() {
  const { identity, importIdentity, clearWallet, isLoaded } = useWallet();

  if (!isLoaded) return <PageLoader />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">My Wallet</h1>
          <p className="text-slate-500 text-sm mt-1">
            Identity stored in IndexedDB · v4 encrypted storage
          </p>
        </div>
        {identity && (
          <button onClick={clearWallet}
            className="text-sm text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 transition">
            Clear Wallet
          </button>
        )}
      </div>

      {!identity ? (
        <ImportSection onImport={importIdentity} />
      ) : (
        <IdentitySection identity={identity} />
      )}
    </div>
  );
}

// ── Import ────────────────────────────────────────────────────────────────────

function ImportSection({ onImport }: { onImport: (id: WalletIdentity) => Promise<void> }) {
  const [raw, setRaw] = useState("");
  const [did, setDid] = useState("");
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"paste" | "manual">("paste");

  async function handlePaste() {
    setErr("");
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.student_did || !parsed.student_private_key_b64 || !parsed.vc_json) {
        throw new Error("Missing required fields: student_did, student_private_key_b64, vc_json");
      }
      const name = (parsed.vc_json?.credentialSubject?.name as string) ?? "Unknown";
      await onImport({
        did: parsed.student_did,
        privateKeyB64: parsed.student_private_key_b64,
        vc: parsed.vc_json,
        holderName: name,
        importedAt: new Date().toISOString(),
        vcCid: parsed.vc_cid,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  async function handleManual() {
    setErr("");
    if (!did.startsWith("did:securedid:") || !key) {
      setErr("DID must start with did:securedid: and private key must be provided.");
      return;
    }
    try {
      // Fetch VC from backend
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/credentials/${encodeURIComponent(did)}`);
      const creds = await resp.json();
      const vc = Array.isArray(creds) && creds.length > 0 ? creds[0].vc_json : {};
      const name = (vc?.credentialSubject?.name as string) ?? "Unknown";
      await onImport({ did, privateKeyB64: key, vc, holderName: name, importedAt: new Date().toISOString() });
    } catch {
      setErr("Could not fetch credential from backend. Check DID and server.");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div className="text-center space-y-2">
        <span className="text-4xl">🔐</span>
        <h2 className="text-xl font-semibold text-slate-800">Import Your Identity</h2>
        <p className="text-sm text-slate-500">
          Paste the approval response from the admin panel, or enter your DID and private key manually.
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        <button onClick={() => setMode("paste")}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${mode === "paste" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
          Paste JSON
        </button>
        <button onClick={() => setMode("manual")}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${mode === "manual" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
          Manual Entry
        </button>
      </div>

      {mode === "paste" ? (
        <div className="space-y-3">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={'{\n  "student_did": "did:securedid:...",\n  "student_private_key_b64": "...",\n  "vc_json": {...}\n}'}
            className="w-full h-36 font-mono text-xs border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
          <button onClick={handlePaste}
            className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition">
            Import Identity
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input value={did} onChange={(e) => setDid(e.target.value)} placeholder="did:securedid:..."
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Private key (base64)…"
            type="password"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <button onClick={handleManual}
            className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition">
            Import Identity
          </button>
        </div>
      )}

      {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{err}</p>}

      <p className="text-xs text-center text-gray-400">
        🔒 Private key stored in IndexedDB — never leaves your browser.
      </p>
    </div>
  );
}

// ── Identity display ──────────────────────────────────────────────────────────

function IdentitySection({ identity }: {
  identity: WalletIdentity;
}) {
  const [tab, setTab] = useState<"credential" | "grants" | "sessions" | "update">("credential");

  return (
    <div className="space-y-4">
      {/* Credential card */}
      <CredentialCard vc={identity.vc} did={identity.did} />

      {/* Warning banner */}
      {!!(identity.vc as Record<string, unknown>)?.is_revoked && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          ⚠️ This credential has been revoked. Contact the admin.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(["credential", "grants", "sessions", "update"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition capitalize
              ${tab === t ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "credential" ? "VC Details" : t === "grants" ? "Access Grants" : t === "sessions" ? "Sessions" : "Update Request"}
          </button>
        ))}
      </div>

      {tab === "credential" && <VCDetails vc={identity.vc} did={identity.did} />}
      {tab === "grants" && <GrantsTab did={identity.did} />}
      {tab === "sessions" && <SessionsTab did={identity.did} />}
      {tab === "update" && <UpdateTab did={identity.did} />}
    </div>
  );
}

// ── VC details tab ────────────────────────────────────────────────────────────

function VCDetails({ vc }: { vc: Record<string, unknown>; did?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="font-semibold text-slate-700">Raw Verifiable Credential</h3>
      <pre className="text-xs font-mono bg-gray-50 rounded-lg p-3 overflow-auto max-h-72 whitespace-pre-wrap break-all border border-gray-100">
        {JSON.stringify(vc, null, 2)}
      </pre>
    </div>
  );
}

// ── Access grants tab ─────────────────────────────────────────────────────────

function GrantsTab({ did }: { did: string }) {
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState("");
  const [domain, setDomain] = useState("");
  const [ttl, setTtl] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getActiveGrants(did).then(setGrants).finally(() => setLoading(false));
  }, [did]);

  async function create() {
    setCreating(true);
    try {
      const g = await createAccessGrant({ student_did: did, platform_name: platform, platform_domain: domain, ttl_minutes: ttl ? Number(ttl) : undefined });
      setGrants((prev) => [...prev, g]);
      setPlatform(""); setDomain(""); setTtl("");
    } finally { setCreating(false); }
  }

  async function revoke(id: string) {
    await revokeGrant(id);
    setGrants((prev) => prev.filter((g) => g.grant_id !== id));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-slate-700">Active Access Grants</h3>
      {loading ? <p className="text-sm text-gray-400">Loading…</p> : grants.length === 0 ? (
        <p className="text-sm text-gray-400">No active grants.</p>
      ) : (
        <div className="space-y-2">
          {grants.map((g) => (
            <div key={g.grant_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{g.platform_name}</p>
                <p className="text-xs text-gray-400">{g.platform_domain}
                  {g.expires_at && ` · expires ${new Date(g.expires_at).toLocaleString()}`}
                </p>
              </div>
              <button onClick={() => revoke(g.grant_id)} className="text-xs text-red-500 hover:text-red-700">Revoke</button>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase">New Grant</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Platform name"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="domain.com"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <input value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="TTL (minutes, blank = permanent)"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm col-span-2" />
        </div>
        <button onClick={create} disabled={!platform || !domain || creating}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
          {creating ? "Creating…" : "Create Grant"}
        </button>
      </div>
    </div>
  );
}

// ── Sessions tab ──────────────────────────────────────────────────────────────

function SessionsTab({ did }: { did: string }) {
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof getSessions>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions(did).then(setSessions).finally(() => setLoading(false));
  }, [did]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="font-semibold text-slate-700">Session Activity</h3>
      {loading ? <p className="text-sm text-gray-400">Loading…</p> : sessions.length === 0 ? (
        <p className="text-sm text-gray-400">No auth sessions recorded yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.log_id} className={`flex items-center gap-3 text-sm rounded-lg px-3 py-2
              ${s.result === "SUCCESS" ? "bg-green-50" : "bg-red-50"}`}>
              <span>{s.result === "SUCCESS" ? "✓" : "✗"}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{s.portal}</p>
                <p className="text-xs text-gray-400">{new Date(s.attempted_at).toLocaleString()}
                  {s.failure_check && ` · Check ${s.failure_check} failed`}
                </p>
              </div>
              {s.is_suspicious && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">⚠ Suspicious</span>
              )}
              {s.ip_address && <span className="text-xs text-gray-400 shrink-0">{s.ip_address}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Update request tab ────────────────────────────────────────────────────────

function UpdateTab({ did }: { did: string }) {
  const [form, setForm] = useState({ field_name: "", old_value: "", new_value: "", requires_vc_reissue: false });
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      await submitUpdateRequest({ student_did: did, ...form });
      setStatus("done");
      setMsg("Update request submitted. Pending 3-of-5 panelist approval.");
    } catch (e: unknown) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-slate-700">Request Data Update</h3>
      {(status === "done" || status === "error") && (
        <div className={`rounded-lg p-3 text-sm ${status === "done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <input value={form.field_name} onChange={(e) => setForm({ ...form, field_name: e.target.value })}
          placeholder="Field name (e.g. department)" required className={inp} />
        <input value={form.old_value} onChange={(e) => setForm({ ...form, old_value: e.target.value })}
          placeholder="Current value" required className={inp} />
        <input value={form.new_value} onChange={(e) => setForm({ ...form, new_value: e.target.value })}
          placeholder="Requested new value" required className={inp} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.requires_vc_reissue}
            onChange={(e) => setForm({ ...form, requires_vc_reissue: e.target.checked })} />
          Requires VC re-issuance (e.g. department transfer)
        </label>
        <button type="submit" disabled={status === "loading"}
          className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
          {status === "loading" ? "Submitting…" : "Submit Update Request"}
        </button>
      </form>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center text-gray-400">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4" />
      Loading wallet…
    </div>
  );
}
