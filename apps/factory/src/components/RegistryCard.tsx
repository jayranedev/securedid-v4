"use client";

import { AddressPill } from "@securedid/shared";
import type { RegistryRow } from "@/lib/factory";

const PROD_PANELIST_URL = "https://securedid-v4-panelist.vercel.app";
const PROD_EXPLORER_URL = "https://securedid-v4-explorer.vercel.app";
const LOCAL_PANELIST_URL = "http://localhost:3001";
const LOCAL_EXPLORER_URL = "http://localhost:3005";

function defaultAppUrl(localUrl: string, productionUrl: string): string {
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return localUrl;
  }
  return productionUrl;
}

export function RegistryCard({ row }: { row: RegistryRow }) {
  const date = new Date(row.deployedAt * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
  const panelistUrl = process.env.NEXT_PUBLIC_PANELIST_URL ?? defaultAppUrl(LOCAL_PANELIST_URL, PROD_PANELIST_URL);
  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? defaultAppUrl(LOCAL_EXPLORER_URL, PROD_EXPLORER_URL);

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
        <a href={`${panelistUrl}/${row.address}`}
          className="sd-btn sd-btn--secondary sd-btn--sm" style={{ flex: 1, justifyContent: "center" }}>
          Panelist portal
        </a>
        <a href={`${explorerUrl}/${row.address}`}
          className="sd-btn sd-btn--secondary sd-btn--sm" style={{ flex: 1, justifyContent: "center" }}>
          Explore
        </a>
      </div>
    </div>
  );
}
