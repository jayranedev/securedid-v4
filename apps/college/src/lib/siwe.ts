import { ethers } from "ethers";

/** Build an EIP-4361 "Sign-In With Ethereum" message (plain-text, no external deps). */
export interface SiweParams {
  domain:    string;
  address:   string;
  statement: string;
  uri:       string;
  version:   string;
  chainId:   number;
  nonce:     string;
  issuedAt:  string;
}

export function buildSiweMessage(p: SiweParams): string {
  return [
    `${p.domain} wants you to sign in with your Ethereum account:`,
    p.address,
    "",
    p.statement,
    "",
    `URI: ${p.uri}`,
    `Version: ${p.version}`,
    `Chain ID: ${p.chainId}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
  ].join("\n");
}

export function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function verifySiweSignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch { return false; }
}
