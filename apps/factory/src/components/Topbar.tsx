"use client";

import { ConnectButton } from "@securedid/shared";

export function Topbar() {
  return (
    <header className="h-14 shrink-0 border-b border-slate-800 bg-slate-950/60 backdrop-blur-sm flex items-center justify-between px-6">
      <div className="text-sm text-slate-400">
        <span className="text-slate-600">Factory ·</span>{" "}
        <span className="text-slate-300">DID Registry Deployment</span>
      </div>
      <ConnectButton />
    </header>
  );
}
