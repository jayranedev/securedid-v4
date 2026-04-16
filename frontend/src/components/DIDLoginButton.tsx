"use client";
/**
 * DIDLoginButton — reusable "Login with SecureDID" button.
 *
 * Flow:
 *  1. GET /api/auth/challenge?domain=<domain>
 *  2. Build signed VP using wallet private key
 *  3. POST /api/auth/verify
 *  4. Store JWT, call onSuccess(token, holderName, isSuspicious)
 */

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { buildSignedVP } from "@/lib/crypto";
import { getChallenge, verifyPresentation } from "@/lib/api";

interface Props {
  domain: string;
  onSuccess: (token: string, holderName: string, isSuspicious: boolean) => void;
  onError?: (msg: string) => void;
  label?: string;
}

export default function DIDLoginButton({ domain, onSuccess, onError, label }: Props) {
  const { identity, setStudentToken } = useWallet();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleLogin() {
    if (!identity) {
      const msg = "No identity in wallet. Import your DID first.";
      setErr(msg);
      onError?.(msg);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      // Step 1 — Request nonce
      const { nonce } = await getChallenge(domain);

      // Step 2 — Build + sign VP
      const vp = await buildSignedVP(
        identity.vc,
        identity.did,
        identity.privateKeyB64,
        nonce,
        domain
      );

      // Step 3 — Verify
      const resp = await verifyPresentation({ verifiable_presentation: vp, domain });

      // Step 4 — Store token
      setStudentToken(resp.access_token);
      onSuccess(resp.access_token, resp.holder_name, resp.is_suspicious);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Authentication failed";
      setErr(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleLogin}
        disabled={loading || !identity}
        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-all
          ${!identity
            ? "bg-gray-400 cursor-not-allowed"
            : loading
            ? "bg-indigo-400 cursor-wait"
            : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md"
          }`}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Signing…
          </>
        ) : (
          <>
            <span className="text-lg">🔐</span>
            {label ?? "Login with SecureDID"}
          </>
        )}
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!identity && (
        <p className="text-xs text-gray-500">
          Open your <a href="/wallet" className="text-indigo-600 underline">wallet</a> to import your identity first.
        </p>
      )}
    </div>
  );
}
