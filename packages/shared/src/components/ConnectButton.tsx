"use client";

import { useWallet, useIsCorrectChain } from "../wallet/WalletContext";
import { shortAddr } from "../chain";

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M16 2.5 L27 6.2 V15.5 C27 22.4 22.3 27.6 16 29.5 C9.7 27.6 5 22.4 5 15.5 V6.2 L16 2.5 Z" fillOpacity="0.15" fill="currentColor" />
    <rect x="10.5" y="12.5" width="6.5" height="5" rx="2.5" />
    <rect x="15" y="14.5" width="6.5" height="5" rx="2.5" />
  </svg>
);

export function ConnectButton() {
  const { address, connecting, connect, disconnect } = useWallet();
  const correctChain = useIsCorrectChain();
  const short = address ? shortAddr(address) : null;

  if (!address) {
    return (
      <button
        onClick={connect}
        disabled={connecting}
        className="sd-connect"
        style={{ opacity: connecting ? 0.7 : 1 }}
      >
        <ShieldIcon />
        <span>{connecting ? "Connecting…" : "Connect wallet"}</span>
      </button>
    );
  }

  if (!correctChain) {
    return (
      <button
        onClick={connect}
        className="sd-connect"
        style={{ background: "var(--danger)" }}
      >
        <span className="sd-connect__dot" style={{ background: "#fca5a5" }} />
        <span>Wrong network — switch</span>
      </button>
    );
  }

  return (
    <button onClick={disconnect} className="sd-connect">
      <span className="sd-connect__dot" />
      <span className="sd-connect__addr">{short}</span>
      <span className="sd-connect__chain">Base Sepolia</span>
    </button>
  );
}
