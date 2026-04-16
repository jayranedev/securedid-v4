"use client";
import { useState } from "react";
import { Registration } from "@/lib/api";

interface Props {
  reg: Registration;
  onApprove: (id: string, keyShare: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}

export default function ApprovalCard({ reg, onApprove, onReject }: Props) {
  const [keyShare, setKeyShare] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("panelist_key_share") ?? "" : ""
  );
  const [rejectReason, setRejectReason] = useState("");
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      if (mode === "approve") await onApprove(reg.request_id, keyShare);
      else await onReject(reg.request_id, rejectReason);
    } finally {
      setLoading(false);
      setMode("idle");
      setKeyShare("");
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{reg.full_name}</p>
          <p className="text-sm text-gray-500">{reg.email} · {reg.roll_number}</p>
          <p className="text-xs text-gray-400">{reg.department} — Year {reg.year}</p>
        </div>
        <div className="text-right text-xs">
          <span className={`inline-block px-2 py-0.5 rounded-full font-medium
            ${reg.csv_match ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {reg.csv_match ? "CSV ✓" : "CSV ✗"}
          </span>
          <p className="mt-1 text-gray-400">{reg.approvals_count}/3 approvals</p>
        </div>
      </div>

      {mode === "idle" && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode("approve")}
            className="flex-1 text-sm bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg px-3 py-2 font-medium transition"
          >
            Approve
          </button>
          <button
            onClick={() => setMode("reject")}
            className="flex-1 text-sm bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-2 font-medium transition"
          >
            Reject
          </button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-2">
          {keyShare && (
            <p className="text-xs text-indigo-600 flex items-center gap-1">
              <span>🔐</span> Key share loaded from browser wallet
            </p>
          )}
          <input
            type="text"
            placeholder="Paste your key share (hex)…"
            value={keyShare}
            onChange={(e) => setKeyShare(e.target.value)}
            className="w-full text-sm font-mono border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="flex gap-2">
            <button onClick={submit} disabled={!keyShare || loading}
              className="flex-1 bg-green-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50">
              {loading ? "Submitting…" : "Submit Approval"}
            </button>
            <button onClick={() => setMode("idle")} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Reason (optional)…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <div className="flex gap-2">
            <button onClick={submit} disabled={loading}
              className="flex-1 bg-red-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50">
              {loading ? "Rejecting…" : "Confirm Reject"}
            </button>
            <button onClick={() => setMode("idle")} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
