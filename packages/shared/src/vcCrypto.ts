import { ethers } from "ethers";

const KEY_MSG = "SecureDID-VC-key-v1";

export interface EncryptedVC {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  data: string;
}

/** Derive a deterministic AES-256-GCM key from the wallet owner's signature. */
export async function deriveVCKey(signer: ethers.Signer): Promise<CryptoKey> {
  const sig = await signer.signMessage(KEY_MSG);
  const keyBytes = new Uint8Array(ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(sig))));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** AES-256-GCM encrypt a VC JSON string. Returns a JSON-serializable object. */
export async function encryptVC(vcJson: string, key: CryptoKey): Promise<EncryptedVC> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(vcJson),
  );
  return {
    v: 1,
    alg: "AES-256-GCM",
    iv: ethers.hexlify(iv),
    data: ethers.hexlify(new Uint8Array(encrypted)),
  };
}

/** AES-256-GCM decrypt an EncryptedVC payload back to VC JSON. */
export async function decryptVC(payload: EncryptedVC, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(ethers.getBytes(payload.iv));
  const data = new Uint8Array(ethers.getBytes(payload.data));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new TextDecoder().decode(plain);
}

/** Upload an encrypted VC to Pinata with a deterministic metadata name. Returns IPFS CID. */
export async function uploadEncryptedVC(
  payload: EncryptedVC,
  registry: string,
  student: string,
  jwt: string,
): Promise<string> {
  const name = `securedid-vc-${registry.toLowerCase()}-${student.toLowerCase()}`;
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pinataContent: payload, pinataMetadata: { name } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata error ${res.status}: ${text.slice(0, 200)}`);
  }
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return IpfsHash;
}

/** Query Pinata for the most recently pinned encrypted VC CID for a given student. */
export async function findEncryptedCID(
  registry: string,
  student: string,
  jwt: string,
): Promise<string | null> {
  const name = `securedid-vc-${registry.toLowerCase()}-${student.toLowerCase()}`;
  const res = await fetch(
    `https://api.pinata.cloud/data/pinList?metadata[name]=${encodeURIComponent(name)}&status=pinned`,
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  if (!res.ok) return null;
  const { rows } = (await res.json()) as { rows: { ipfs_pin_hash: string }[] };
  return rows?.[0]?.ipfs_pin_hash ?? null;
}
