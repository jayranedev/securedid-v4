"use client";
import { useState, useEffect, useCallback } from "react";
import { getProposals, createProposal, voteProposal, getPanelists, type Proposal, type Panelist } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function GovernancePage() {
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem("panelist_token");
    if (!t) { router.push("/admin"); return; }
    setToken(t);
  }, [router]);

  if (!token) return <p className="text-center py-20 text-gray-400">Redirecting to login…</p>;
  return <GovernanceDashboard token={token} />;
}

function GovernanceDashboard({ token }: { token: string }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [panelists, setPanelists] = useState<Panelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getProposals(token), getPanelists(token)])
      .then(([p, pan]) => { setProposals(p); setPanelists(pan); })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function vote(proposalId: string, v: boolean) {
    try {
      await voteProposal(proposalId, v, token);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Vote failed");
    }
  }

  const open = proposals.filter((p) => p.status === "open");
  const closed = proposals.filter((p) => p.status !== "open");

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Governance</h1>
          <p className="text-sm text-slate-500">3-of-5 threshold proposals — add/remove panelists, policy changes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50">
            ↻ Refresh
          </button>
          <button onClick={() => setShowForm((v) => !v)}
            className="text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700">
            + New Proposal
          </button>
        </div>
      </div>

      {showForm && (
        <NewProposalForm token={token} panelists={panelists} onDone={() => { setShowForm(false); load(); }} />
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          {open.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Active Proposals</h2>
              {open.map((p) => <ProposalCard key={p.proposal_id} proposal={p} onVote={vote} />)}
            </section>
          )}
          {open.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              No active proposals.
            </div>
          )}
          {closed.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide mt-4">Resolved</h2>
              {closed.map((p) => <ProposalCard key={p.proposal_id} proposal={p} onVote={vote} resolved />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ProposalCard({ proposal: p, onVote, resolved }: {
  proposal: Proposal; onVote: (id: string, v: boolean) => void; resolved?: boolean;
}) {
  const statusColors: Record<string, string> = {
    open: "bg-blue-50 text-blue-700 border-blue-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    expired: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const total = p.votes_yes + p.votes_no;

  return (
    <div className={`bg-white rounded-xl border p-5 space-y-3 ${resolved ? "opacity-75" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-semibold text-slate-800 text-sm">{formatProposalType(p.proposal_type)}</p>
          {p.new_panelist_name && (
            <p className="text-xs text-gray-500">{p.new_panelist_name} · {p.new_panelist_email} · {p.new_panelist_department}</p>
          )}
          {p.reason && <p className="text-xs text-gray-500 italic">{p.reason}</p>}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded border shrink-0 ${statusColors[p.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
          {p.status}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <VoteBar yes={p.votes_yes} total={total} />
        <span className="text-xs text-gray-400">{p.votes_yes} yes · {p.votes_no} no</span>
      </div>

      <p className="text-xs text-gray-400">
        Expires {new Date(p.expires_at).toLocaleDateString()}
        {p.resolved_at && ` · Resolved ${new Date(p.resolved_at).toLocaleDateString()}`}
      </p>

      {!resolved && (
        <div className="flex gap-2 pt-1">
          <button onClick={() => onVote(p.proposal_id, true)}
            className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100">
            Vote Yes
          </button>
          <button onClick={() => onVote(p.proposal_id, false)}
            className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100">
            Vote No
          </button>
        </div>
      )}
    </div>
  );
}

function VoteBar({ yes, total }: { yes: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((yes / total) * 100);
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function NewProposalForm({ token, panelists, onDone }: {
  token: string; panelists: Panelist[]; onDone: () => void;
}) {
  const [type, setType] = useState("add_panelist");
  const [reason, setReason] = useState("");
  const [targetId, setTargetId] = useState("");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [dept, setDept] = useState("CS");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr("");
    try {
      const body: Parameters<typeof createProposal>[0] = { proposal_type: type, reason };
      if (type === "remove_panelist") body.target_panelist_id = targetId;
      if (type === "add_panelist") {
        body.new_panelist_name = name;
        body.new_panelist_email = email;
        body.new_panelist_department = dept;
      }
      await createProposal(body, token);
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 space-y-4">
      <h3 className="font-semibold text-indigo-800">Create Governance Proposal</h3>
      {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Proposal Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
            <option value="add_panelist">Add Panelist</option>
            <option value="remove_panelist">Remove Panelist</option>
            <option value="change_threshold">Change Threshold</option>
            <option value="other">Other</option>
          </select>
        </div>

        {type === "add_panelist" && (
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-slate-600">Full Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inp} placeholder="Dr. Jane Smith" /></div>
            <div><label className="text-xs font-medium text-slate-600">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inp} placeholder="jane@dbce.edu" /></div>
            <div><label className="text-xs font-medium text-slate-600">Department</label>
              <select value={dept} onChange={(e) => setDept(e.target.value)} className={sel}>
                {["CS","IT","EC","ME","CIVIL"].map((d) => <option key={d}>{d}</option>)}
              </select></div>
          </div>
        )}

        {type === "remove_panelist" && (
          <div>
            <label className="text-xs font-medium text-slate-600">Select Panelist to Remove</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required className={sel}>
              <option value="">— choose —</option>
              {panelists.filter((p) => p.is_active).map((p) => (
                <option key={p.panelist_id} value={p.panelist_id}>{p.name} ({p.email})</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-600">Reason / Notes</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Why is this proposal needed?" />
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={loading}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
            {loading ? "Submitting…" : "Submit Proposal"}
          </button>
          <button type="button" onClick={onDone} className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function formatProposalType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white mt-1";
const sel = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 mt-1";
