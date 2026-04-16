"use client";
import { useState, useEffect, useCallback } from "react";
import {
  panelistLogin, getPending, approvePending, rejectPending,
  approveBatch, getMyShare, getPendingUpdates, approveUpdate,
  revokeStudent, getCredentials, walletChallenge, walletVerify, linkWallet,
  type Registration, type DataUpdateRequest,
} from "@/lib/api";
import ApprovalCard from "@/components/ApprovalCard";

// ── Key share helpers — browser-side encrypted storage ───────────────────────

function saveKeyShare(share: string) {
  localStorage.setItem("panelist_key_share", share);
}
function loadKeyShare(): string {
  return localStorage.getItem("panelist_key_share") ?? "";
}
function clearKeyShare() {
  localStorage.removeItem("panelist_key_share");
}

// ── Root page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [panelist, setPanelist] = useState<{ name: string; email: string; eth_address?: string | null } | null>(null);
  const [shareReady, setShareReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("panelist_token");
    if (t) {
      setToken(t);
      setPanelist(JSON.parse(localStorage.getItem("panelist_info") ?? "{}"));
      setShareReady(!!loadKeyShare());
    }
  }, []);

  // After login: fetch key share automatically and cache it
  async function onLogin(t: string, p: { name: string; email: string; eth_address?: string | null }) {
    setToken(t);
    setPanelist(p);
    localStorage.setItem("panelist_token", t);
    localStorage.setItem("panelist_info", JSON.stringify(p));
    try {
      const s = await getMyShare(t);
      saveKeyShare(s.key_share);
      setShareReady(true);
    } catch {
      // Share fetch failed — panelist will need to visit My Share tab once
      setShareReady(false);
    }
  }

  if (!token) return <LoginForm onLogin={onLogin} />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm flex items-center gap-2">
            Welcome, {panelist?.name} ({panelist?.email})
            {shareReady && <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">🔐 Key share ready</span>}
          </p>
        </div>
        <button onClick={() => {
          localStorage.removeItem("panelist_token");
          localStorage.removeItem("panelist_info");
          clearKeyShare();
          setToken(null);
          setShareReady(false);
        }} className="text-sm text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5">
          Logout
        </button>
      </div>

      {!shareReady && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          ⚠️ Key share not cached. Visit the <strong>My Share</strong> tab once to enable one-click approvals.
        </div>
      )}

      {!panelist?.eth_address && (
        <LinkWalletBanner token={token} onLinked={(addr) => setPanelist((p) => p ? { ...p, eth_address: addr } : p)} />
      )}

      {panelist?.eth_address && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2">
          <span>🦊</span>
          <span>Wallet linked: <code className="font-mono text-orange-700">{panelist.eth_address}</code></span>
          <span className="text-slate-400">· Base Sepolia</span>
        </div>
      )}

      <AdminTabs token={token} onShareReady={() => setShareReady(true)} />
    </div>
  );
}

// ── Link Wallet Banner ────────────────────────────────────────────────────────

function LinkWalletBanner({ token, onLinked }: { token: string; onLinked: (addr: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function link() {
    setErr(""); setLoading(true);
    try {
      const eth = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) { setErr("MetaMask not detected."); return; }
      const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0].toLowerCase();
      await linkWallet(address, token);
      onLinked(address);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to link wallet");
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm space-y-2">
      <p className="text-orange-800 font-medium">🦊 Link your Base Sepolia wallet for one-click future logins</p>
      <p className="text-orange-700 text-xs">Connect MetaMask once to associate your wallet address with this account.</p>
      {err && <p className="text-red-600 text-xs">{err}</p>}
      <button onClick={link} disabled={loading}
        className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-60 transition">
        {loading ? "Linking…" : "Connect & Link Wallet"}
      </button>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (token: string, panelist: { name: string; email: string; eth_address?: string | null }) => Promise<void> }) {
  const [tab, setTab] = useState<"wallet" | "password">("wallet");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const res = await panelistLogin(email, password);
      await onLogin(res.access_token, { name: res.panelist.name, email: res.panelist.email, eth_address: res.panelist.eth_address });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally { setLoading(false); }
  }

  async function connectMetaMask() {
    setErr(""); setLoading(true);
    try {
      const eth = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) { setErr("MetaMask not detected. Install MetaMask and connect to Base Sepolia."); return; }

      // Request accounts
      const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0].toLowerCase();

      // Get challenge from backend
      const { challenge } = await walletChallenge(address);

      // Sign with MetaMask
      const signature = await eth.request({
        method: "personal_sign",
        params: [challenge, address],
      }) as string;

      // Verify with backend → JWT
      const res = await walletVerify(address, signature);
      await onLogin(res.access_token, { name: res.panelist.name, email: res.panelist.email, eth_address: res.panelist.eth_address });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Wallet login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16 space-y-6">
      <div className="text-center">
        <span className="text-4xl">🏛️</span>
        <h1 className="text-2xl font-bold mt-3 text-slate-800">Panelist Login</h1>
        <p className="text-sm text-slate-500 mt-1">SecureDID Admin — Base Sepolia</p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        <button onClick={() => setTab("wallet")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === "wallet" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
          🦊 MetaMask Wallet
        </button>
        <button onClick={() => setTab("password")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === "password" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
          🔑 Password
        </button>
      </div>

      {err && <p className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{err}</p>}

      {tab === "wallet" ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <p className="text-sm text-gray-500 text-center">
            Connect your Base Sepolia wallet to authenticate. Your wallet address must be linked to your panelist account.
          </p>
          <div className="text-center text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
            Chain: Base Sepolia (84532)
          </div>
          <button onClick={connectMetaMask} disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 transition">
            {loading ? "Connecting…" : <><span className="text-lg">🦊</span> Connect MetaMask</>}
          </button>
        </div>
      ) : (
        <form onSubmit={submitPassword} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="panelist@dbce.edu" className={inp} />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" className={inp} />
          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60">
            {loading ? "Logging in…" : "Login"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ["Pending Approvals", "Batch Approve", "Data Updates", "Revocation", "My Share"] as const;

function AdminTabs({ token, onShareReady }: { token: string; onShareReady: () => void }) {
  const [tab, setTab] = useState<typeof TABS[number]>("Pending Approvals");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Pending Approvals" && <PendingTab token={token} />}
      {tab === "Batch Approve" && <BatchTab token={token} />}
      {tab === "Data Updates" && <DataUpdatesTab token={token} />}
      {tab === "Revocation" && <RevocationTab token={token} />}
      {tab === "My Share" && <MyShareTab token={token} onShareReady={onShareReady} />}
    </div>
  );
}

// ── Pending approvals ─────────────────────────────────────────────────────────

function PendingTab({ token }: { token: string }) {
  const [pending, setPending] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    getPending(token).then(setPending).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string, keyShare: string) {
    const res = await approvePending(id, keyShare, token);
    if (res.student_did) {
      alert(`✓ DID issued!\n\nDID: ${res.student_did}\n\nPrivate Key (base64):\n${res.student_private_key_b64}\n\nShare this with the student — it won't be shown again.`);
    } else {
      alert(`Vote recorded. ${res.registration.approvals_count}/3 approvals so far.`);
    }
    load();
  }

  async function reject(id: string, reason: string) {
    await rejectPending(id, reason, token);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">Pending Registrations</h2>
        <button onClick={load} className="text-xs text-indigo-600 hover:text-indigo-800">↻ Refresh</button>
      </div>
      {loading ? <p className="text-sm text-gray-400">Loading…</p>
        : pending.length === 0 ? <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-6 text-center">No pending registrations.</p>
        : pending.map((r) => <ApprovalCard key={r.request_id} reg={r} onApprove={approve} onReject={reject} />)
      }
    </div>
  );
}

// ── Batch approve ─────────────────────────────────────────────────────────────

function BatchTab({ token }: { token: string }) {
  const [result, setResult] = useState<{ votes_added: number; newly_approved: number; pending_total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    const keyShare = loadKeyShare();
    if (!keyShare) { setErr("Key share not cached. Visit My Share tab first."); return; }
    setLoading(true); setErr("");
    try {
      const r = await approveBatch(keyShare, token);
      setResult(r);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 max-w-lg">
      <h2 className="font-semibold text-slate-700">Batch Approve All Pending</h2>
      <p className="text-sm text-gray-500">Vote YES on all currently pending registrations in one click using your cached key share.</p>
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{err}</p>}
      <button onClick={submit} disabled={loading}
        className="w-full bg-indigo-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60">
        {loading ? "Submitting…" : "🔐 Batch Approve (using cached share)"}
      </button>
      {result && (
        <div className="grid grid-cols-3 gap-3">
          {[["Votes Added", result.votes_added], ["Newly Issued", result.newly_approved], ["Total Pending", result.pending_total]].map(([label, val]) => (
            <div key={String(label)} className="bg-indigo-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-indigo-700">{val}</p>
              <p className="text-xs text-indigo-500">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Data updates ──────────────────────────────────────────────────────────────

function DataUpdatesTab({ token }: { token: string }) {
  const [updates, setUpdates] = useState<DataUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPendingUpdates(token).then(setUpdates).finally(() => setLoading(false));
  }, [token]);

  async function approve(id: string) {
    const keyShare = loadKeyShare();
    if (!keyShare) { alert("Key share not cached. Visit My Share tab first."); return; }
    await approveUpdate(id, keyShare, token);
    setUpdates((prev) => prev.filter((u) => u.update_id !== id));
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-slate-700">Pending Data Updates</h2>
      {loading ? <p className="text-sm text-gray-400">Loading…</p>
        : updates.length === 0 ? <p className="text-sm text-gray-400">No pending updates.</p>
        : updates.map((u) => (
          <div key={u.update_id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{u.student_did.slice(-24)}</p>
                <p className="text-xs text-gray-500">
                  <span className="font-medium">{u.field_name}</span>: {u.old_value} → {u.new_value}
                  {u.requires_vc_reissue && " (VC re-issue required)"}
                </p>
              </div>
              <span className="text-xs text-gray-400">{u.approvals_count}/3</span>
            </div>
            <button onClick={() => approve(u.update_id)}
              className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg px-3 py-1.5 hover:bg-green-100">
              🔐 Approve
            </button>
          </div>
        ))
      }
    </div>
  );
}

// ── Revocation ────────────────────────────────────────────────────────────────

function RevocationTab({ token }: { token: string }) {
  const [did, setDid] = useState("");
  const [credId, setCredId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function lookupCred() {
    try {
      const creds = await getCredentials(did);
      if (creds.length === 0) { setMsg("No credentials found for this DID."); return; }
      setCredId(creds[0].credential_id);
      setMsg(`Credential found: ${creds[0].credential_id}`);
    } catch {
      setMsg("Error looking up credentials.");
    }
  }

  async function revoke() {
    setLoading(true);
    try {
      const r = await revokeStudent(credId, reason, token);
      setMsg(r.is_revoked ? "✓ Credential revoked." : "Vote recorded. Need another panelist.");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 max-w-lg">
      <h2 className="font-semibold text-slate-700">Revoke Student Credential</h2>
      <p className="text-sm text-gray-500">Requires 2-of-5 panelist votes. Each panelist calls this endpoint once.</p>
      <div className="flex gap-2">
        <input value={did} onChange={(e) => setDid(e.target.value)} placeholder="did:securedid:…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <button onClick={lookupCred} className="bg-gray-100 text-gray-700 rounded-lg px-3 py-2 text-sm hover:bg-gray-200">
          Lookup
        </button>
      </div>
      {credId && (
        <>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for revocation…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={revoke} disabled={loading}
            className="w-full bg-red-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60">
            {loading ? "Voting…" : "Vote to Revoke"}
          </button>
        </>
      )}
      {msg && <p className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">{msg}</p>}
    </div>
  );
}

// ── My share ──────────────────────────────────────────────────────────────────

function MyShareTab({ token, onShareReady }: { token: string; onShareReady: () => void }) {
  const [share, setShare] = useState<{ panelist: string; email: string; key_share: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(!!loadKeyShare());

  async function load() {
    setLoading(true);
    try {
      const s = await getMyShare(token);
      setShare(s);
      saveKeyShare(s.key_share);
      setCached(true);
      onShareReady();
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 max-w-lg">
      <h2 className="font-semibold text-slate-700">My Shamir Key Share</h2>
      <p className="text-sm text-gray-500">Each panelist holds one of 5 shares. 3 are required to reconstruct the master signing key.</p>
      {cached && !share && (
        <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg p-3">
          🔐 Key share is cached in your browser — approval forms work automatically.
          Click below to view or refresh it.
        </p>
      )}
      <button onClick={load} disabled={loading}
        className="bg-indigo-600 text-white rounded-xl px-6 py-2.5 font-semibold text-sm disabled:opacity-60">
        {loading ? "Loading…" : cached ? "Refresh Share" : "Reveal My Share"}
      </button>
      {share && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{share.panelist} · {share.email}</p>
          <div className="bg-gray-900 rounded-xl p-4">
            <p className="font-mono text-xs text-green-400 break-all">{share.key_share}</p>
          </div>
          <p className="text-xs text-indigo-600">✓ Cached in browser — clears on logout or browser data clear.</p>
        </div>
      )}
    </div>
  );
}

const inp = "w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
