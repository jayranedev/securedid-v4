import { ethers } from "ethers";

export const ENROLLMENT_SALT = ethers.keccak256(ethers.toUtf8Bytes("SecureDID-V6-Enrollment"));

export interface EnrollmentFields {
  email:      string;
  roll:       string;
  name:       string;
  department: string;
  year:       number;
  secret:     string;
}

/** SHA-256 of a UTF-8 string, as 32-byte hex. */
export async function hashSecret(secret: string): Promise<string> {
  return ethers.sha256(ethers.toUtf8Bytes(secret));
}

/**
 * Compute the enrollment commitment the panelist + student both agree on.
 * keccak256(SALT || email || roll || name || dept || year || secretHash)
 */
export async function computeCommitment(f: EnrollmentFields): Promise<string> {
  const secretHash = await hashSecret(f.secret);
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "string", "string", "string", "string", "uint16", "bytes32"],
      [ENROLLMENT_SALT, f.email, f.roll, f.name, f.department, f.year, secretHash],
    ),
  );
}

/** Request MetaMask's built-in x25519 encryption public key for a given account. */
export async function getMetaMaskEncryptionPubkey(address: string): Promise<string> {
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    throw new Error("MetaMask not installed");
  }
  const eth = (window as unknown as { ethereum: { request: (a: unknown) => Promise<unknown> } }).ethereum;
  return eth.request({
    method: "eth_getEncryptionPublicKey",
    params: [address],
  }) as Promise<string>;
}

/** Decrypt data previously encrypted with MetaMask's x25519-xsalsa20-poly1305. */
export async function decryptWithMetaMask(ciphertextHex: string, address: string): Promise<string> {
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    throw new Error("MetaMask not installed");
  }
  const eth = (window as unknown as { ethereum: { request: (a: unknown) => Promise<unknown> } }).ethereum;
  return eth.request({
    method: "eth_decrypt",
    params: [ciphertextHex, address],
  }) as Promise<string>;
}

/** Convert a hex-encoded 32-byte pubkey to the base64 form MetaMask stores internally. */
export function pubkeyHexToBase64(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return btoa(String.fromCharCode(...bytes));
}
