"use client";
import { getCardUrl } from "@/lib/api";

interface Props {
  vc: Record<string, unknown>;
  did: string;
  isRevoked?: boolean;
}

export default function CredentialCard({ vc, did, isRevoked }: Props) {
  const subject = (vc.credentialSubject ?? {}) as Record<string, unknown>;
  const issuanceDate = typeof vc.issuanceDate === "string" ? vc.issuanceDate.slice(0, 10) : "—";
  const expirationDate = typeof vc.expirationDate === "string" ? vc.expirationDate.slice(0, 10) : "—";

  return (
    <div className={`rounded-2xl overflow-hidden shadow-lg border ${isRevoked ? "border-red-300 opacity-70" : "border-indigo-200"}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-80">SecureDID Identity Card</p>
            <p className="text-xl font-bold mt-1">{String(subject.name ?? "—")}</p>
          </div>
          <span className="text-4xl">🎓</span>
        </div>
        {isRevoked && (
          <span className="mt-2 inline-block bg-red-500 text-xs font-bold px-2 py-0.5 rounded">REVOKED</span>
        )}
      </div>

      {/* Body */}
      <div className="bg-white px-6 py-4 grid grid-cols-2 gap-3 text-sm">
        <Field label="Roll Number" value={String(subject.rollNumber ?? "—")} />
        <Field label="Department" value={String(subject.department ?? "—")} />
        <Field label="Year" value={String(subject.year ?? "—")} />
        <Field label="Issued" value={issuanceDate} />
        <Field label="Expires" value={expirationDate} />
        <Field label="Status" value={isRevoked ? "Revoked" : "Active"} />
      </div>

      {/* DID */}
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">DID</p>
        <p className="font-mono text-xs text-gray-600 break-all">{did}</p>
      </div>

      {/* Actions */}
      {!isRevoked && (
        <div className="bg-white px-6 py-3 border-t border-gray-100 flex gap-2 flex-wrap">
          <a
            href={getCardUrl(did)}
            target="_blank"
            rel="noreferrer"
            className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition"
          >
            📄 Download PDF Card
          </a>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/credentials/${encodeURIComponent(did)}/export`}
            className="text-xs bg-gray-50 text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg font-medium transition"
          >
            💾 Export JSON
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="font-medium text-gray-800">{value}</p>
    </div>
  );
}
