"use client";

import { useState } from "react";
import { AddressPill } from "@securedid/shared";
import type { RegistryRow } from "@/lib/factory";

const PANELIST_URL = process.env.NEXT_PUBLIC_PANELIST_URL || "https://securedid-v4-panelist.vercel.app";
const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://securedid-v4-explorer.vercel.app";

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const InstitutionIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-4h6v4" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9 14h.01" /><path d="M15 14h.01" />
  </svg>
);

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); }}
      className="sd-icon-btn"
      title="Copy address"
      style={{ width: 26, height: 26 }}
    >
      {ok ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export function RegistryCard({ row }: { row: RegistryRow }) {
  const date = new Date(row.deployedAt * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
  const panelistUrl = PANELIST_URL;
  const explorerUrl = EXPLORER_URL;

  return (
    <div className="sd-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", transition: "box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-lg)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Header */}
      <div style={{ padding: "20px 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "var(--radius-md)", flexShrink: 0,
            background: "linear-gradient(135deg, var(--accent-100), var(--accent-50))",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)",
          }}>
            <InstitutionIcon />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "var(--fw-semibold) 16px/1.3 var(--font-heading)", color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
            {row.website && (
              <a href={row.website} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                {row.website} <ExternalIcon />
              </a>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span className="sd-pill sd-pill--active"><span className="sd-pill__dot" /> Active</span>
          <span style={{ font: "var(--fw-regular) 10px/1 var(--font-sans)", color: "var(--fg-4)" }}>{date}</span>
        </div>
      </div>

      {/* Address rows */}
      <div style={{ padding: "0 24px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--fg-3)", font: "var(--fw-semibold) 10px/1 var(--font-sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Registry</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <AddressPill address={row.address} />
            <CopyBtn text={row.address} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--fg-3)", font: "var(--fw-semibold) 10px/1 var(--font-sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Deployer</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <AddressPill address={row.deployer} />
            <CopyBtn text={row.deployer} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 0, borderTop: "1px solid var(--border-subtle)" }}>
        <a href={`${panelistUrl}/${row.address}`}
          className="sd-btn sd-btn--ghost" style={{ flex: 1, justifyContent: "center", borderRadius: 0, height: 42, fontSize: 13, borderRight: "1px solid var(--border-subtle)" }}>
          Panelist portal
        </a>
        <a href={`${explorerUrl}/${row.address}`}
          className="sd-btn sd-btn--ghost" style={{ flex: 1, justifyContent: "center", borderRadius: 0, height: 42, fontSize: 13 }}>
          Explore
        </a>
      </div>
    </div>
  );
}
