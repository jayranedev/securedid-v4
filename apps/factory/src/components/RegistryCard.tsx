"use client";

import { AddressPill } from "@securedid/shared";
import type { RegistryRow } from "@/lib/factory";

export function RegistryCard({ row }: { row: RegistryRow }) {
  const date = new Date(row.deployedAt * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className="sd-card sd-card--pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ font: "var(--fw-semibold) 15px/1.3 var(--font-sans)", color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
          {row.website && (
            <a href={row.website} target="_blank" rel="noopener noreferrer"
              style={{ font: "var(--fw-regular) 12px/1 var(--font-sans)", color: "var(--accent)", display: "inline-block", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {row.website}
            </a>
          )}
        </div>
        <span style={{ font: "var(--fw-regular) 11px/1 var(--font-sans)", color: "var(--fg-4)", whiteSpace: "nowrap" }}>{date}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--fg-3)" }}>Registry</span>
          <AddressPill address={row.address} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--fg-3)" }}>Deployer</span>
          <AddressPill address={row.deployer} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
        <a href={`${process.env.NEXT_PUBLIC_PANELIST_URL ?? "http://localhost:3001"}/${row.address}`}
          className="sd-btn sd-btn--secondary sd-btn--sm" style={{ flex: 1, justifyContent: "center" }}>
          Panelist portal
        </a>
        <a href={`${process.env.NEXT_PUBLIC_EXPLORER_URL ?? "http://localhost:3005"}/${row.address}`}
          className="sd-btn sd-btn--secondary sd-btn--sm" style={{ flex: 1, justifyContent: "center" }}>
          Explore
        </a>
      </div>
    </div>
  );
}
