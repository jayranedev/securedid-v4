"use client";

import { useState } from "react";
import { shortAddr, explorerAddress } from "../chain";

const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ExternalIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

export function AddressPill({
  address,
  head = 6,
  tail = 4,
  showExplorer = true,
}: {
  address: string;
  head?: number;
  tail?: number;
  showExplorer?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const doFallback = () => {
      const ta = document.createElement("textarea");
      ta.value = address;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address).catch(doFallback);
    } else {
      doFallback();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <span className="sd-address" onClick={copy} title={copied ? "Copied!" : "Click to copy"}>
      <span>{shortAddr(address, head, tail)}</span>
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <CopyIcon />
      )}
      {showExplorer && (
        <a
          href={explorerAddress(address)}
          target="_blank"
          rel="noopener noreferrer"
          title="View on Basescan"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalIcon />
        </a>
      )}
    </span>
  );
}
