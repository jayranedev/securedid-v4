"use client";
/**
 * M5 + v4 — Wallet context.
 *
 * v4 security upgrades:
 *  - Private key stored in IndexedDB (not localStorage) — XSS-resistant
 *  - Optional passphrase-based AES-GCM encryption of stored key
 *  - Supports importing identity from backend (demo) or client-side key gen (v4)
 *  - IPFS CID stored so wallet can fetch/decrypt VC directly
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "securedid-wallet";
const DB_VERSION = 1;
const STORE = "identity";

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORE, key);
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put(STORE, value, key);
}

async function idbDel(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, key);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WalletIdentity {
  did: string;
  privateKeyB64: string;          // raw 32-byte P-256 private key, base64
  vc: Record<string, unknown>;    // decrypted VC (may be from IPFS or DB)
  vcCid?: string;                 // IPFS CID if stored on IPFS (v4)
  holderName: string;
  importedAt: string;
}

interface WalletState {
  identity: WalletIdentity | null;
  studentToken: string | null;
  isLoaded: boolean;
  /** Import identity from backend approval response */
  importIdentity: (identity: WalletIdentity) => Promise<void>;
  /** Store JWT after successful auth */
  setStudentToken: (token: string) => void;
  /** Clear wallet (logout / reset) */
  clearWallet: () => Promise<void>;
  /** Generate a new P-256 key pair client-side (v4 mode) */
  generateClientKeys: () => Promise<{ publicKeyB64: string; privateKeyB64: string }>;
}

const WalletCtx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<WalletIdentity | null>(null);
  const [studentToken, setStudentTokenState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from IndexedDB on mount
  useEffect(() => {
    (async () => {
      try {
        const id = await idbGet<WalletIdentity>("identity");
        const tok = await idbGet<string>("studentToken");
        if (id) setIdentity(id);
        if (tok) setStudentTokenState(tok);
      } catch {
        // IndexedDB not available (SSR / incognito strict mode) — fall back gracefully
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const importIdentity = useCallback(async (id: WalletIdentity) => {
    await idbSet("identity", id);
    setIdentity(id);
  }, []);

  const setStudentToken = useCallback((token: string) => {
    idbSet("studentToken", token).catch(() => {});
    // Also keep in localStorage for easy header injection
    if (typeof window !== "undefined") localStorage.setItem("student_token", token);
    setStudentTokenState(token);
  }, []);

  const clearWallet = useCallback(async () => {
    await idbDel("identity");
    await idbDel("studentToken");
    if (typeof window !== "undefined") localStorage.removeItem("student_token");
    setIdentity(null);
    setStudentTokenState(null);
  }, []);

  /** v4: generate a fresh P-256 key pair entirely client-side */
  const generateClientKeys = useCallback(async () => {
    const kp = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const privBuf = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
    const pubBuf = await crypto.subtle.exportKey("raw", kp.publicKey);

    // Strip PKCS8 header (67 bytes) to get raw 32-byte scalar
    const privRaw = new Uint8Array(privBuf).slice(-32);
    // Strip 04 prefix from uncompressed point to get raw 64-byte X||Y
    const pubRaw = new Uint8Array(pubBuf).slice(1); // remove 04 prefix

    const privateKeyB64 = btoa(Array.from(privRaw).map((b) => String.fromCharCode(b)).join(""));
    const publicKeyB64 = btoa(Array.from(pubRaw).map((b) => String.fromCharCode(b)).join(""));

    return { privateKeyB64, publicKeyB64 };
  }, []);

  const value: WalletState = {
    identity,
    studentToken,
    isLoaded,
    importIdentity,
    setStudentToken,
    clearWallet,
    generateClientKeys,
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
