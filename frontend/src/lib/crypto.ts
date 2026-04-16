/**
 * M5 — Client-side VP signing using Web Crypto API.
 *
 * Compatibility notes with Python backend (ecdsa library):
 *  - Private key stored as base64 of raw 32-byte P-256 private key scalar
 *  - Public key stored as base64 of raw 64-byte uncompressed point (X||Y, no prefix)
 *  - Sign pipeline:
 *      canonical = sortedJSON(vpBody)
 *      dataHash  = SHA-256(canonical)         ← explicit pre-hash
 *      sig       = ECDSA_P256_sign(dataHash)  ← Web Crypto hashes again internally
 *    This produces sha256(sha256(canonical)) which matches:
 *      Python: vk.verify(sig, dataHash) → internally sha256(dataHash)
 *  - Signature format: raw r||s (64 bytes), hex-encoded — matches ecdsa library default
 */

// ── Key helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a raw 32-byte P-256 private key to PKCS#8 DER (required by Web Crypto importKey).
 * Minimal structure without embedded public key.
 */
function rawP256ToPKCS8(rawKey: Uint8Array): ArrayBuffer {
  // PKCS8 wrapper for P-256 EC key (67 bytes total)
  const header = new Uint8Array([
    0x30, 0x41,                                           // SEQUENCE 65 bytes
    0x02, 0x01, 0x00,                                     // INTEGER version = 0
    0x30, 0x13,                                           // SEQUENCE 19 bytes (AlgId)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID prime256v1
    0x04, 0x27,                                           // OCTET STRING 39 bytes
    0x30, 0x25,                                           // SEQUENCE 37 bytes (ECPrivateKey)
    0x02, 0x01, 0x01,                                     // INTEGER version = 1
    0x04, 0x20,                                           // OCTET STRING 32 bytes
  ]);
  const pkcs8 = new Uint8Array(header.length + 32);
  pkcs8.set(header);
  pkcs8.set(rawKey.slice(0, 32), header.length);
  return pkcs8.buffer;
}

/** Import a raw base64 P-256 private key as a CryptoKey for signing. */
export async function importPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  const rawBytes = Uint8Array.from(atob(privateKeyB64), (c) => c.charCodeAt(0));
  const pkcs8 = rawP256ToPKCS8(rawBytes);
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

// ── Canonical JSON ────────────────────────────────────────────────────────────

/**
 * Produce canonical JSON with sorted keys at all levels.
 * Matches Python: json.dumps(obj, sort_keys=True, separators=(",", ":"))
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") + "}";
}

// ── VP construction & signing ─────────────────────────────────────────────────

export interface VerifiablePresentation {
  "@context": string[];
  type: string[];
  holder: string;
  verifiableCredential: unknown[];
  nonce: string;
  domain: string;
  created: string;
  proof?: { type: string; proofPurpose: string; verificationMethod: string; proofValue: string };
}

/**
 * Build a VP body, sign it, and return the complete VP with proof.
 *
 * Signing input (matching Python auth_service.verify_presentation):
 *   canonical = sortedJSON(vpBody)          (vpBody = VP without proof field)
 *   dataHash  = SHA-256(canonical_utf8)
 *   sig       = sign(privateKey, dataHash)  (Web Crypto applies SHA-256 again internally)
 */
export async function buildSignedVP(
  vc: unknown,
  holderDid: string,
  privateKeyB64: string,
  nonce: string,
  domain: string
): Promise<VerifiablePresentation> {
  const vpBody: VerifiablePresentation = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiablePresentation"],
    holder: holderDid,
    verifiableCredential: [vc],
    nonce,
    domain,
    created: new Date().toISOString(),
  };

  const canonical = canonicalJSON(vpBody);
  const canonicalBytes = new TextEncoder().encode(canonical);

  // Pre-hash once explicitly (Python does this before calling vk.verify)
  const dataHash = await crypto.subtle.digest("SHA-256", canonicalBytes);

  // Import private key and sign — Web Crypto hashes dataHash again with SHA-256 internally,
  // producing sha256(sha256(canonical)) which matches Python ecdsa library behavior.
  const cryptoKey = await importPrivateKey(privateKeyB64);
  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    dataHash
  );

  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    ...vpBody,
    proof: {
      type: "EcdsaSecp256r1Signature2019",
      proofPurpose: "authentication",
      verificationMethod: `${holderDid}#key-1`,
      proofValue: sigHex,
    },
  };
}
