import { ethers } from "ethers";

export const CHAIN_ID = 84532;
export const CHAIN_NAME = "Base Sepolia";
export const RPC_PROXY_PATH = "/api/rpc";
export const EXPLORER_URL = "https://sepolia.basescan.org";
export const DEFAULT_RPC_URL = "https://sepolia.base.org";

const BASE_SEPOLIA_NETWORK = ethers.Network.from({ name: CHAIN_NAME, chainId: CHAIN_ID });
let readProvider: ethers.JsonRpcProvider | null = null;

function getServerRpcUrl(): string {
  return process.env.BASE_RPC_URL ?? DEFAULT_RPC_URL;
}

export function getReadProvider(): ethers.JsonRpcProvider {
  if (readProvider) return readProvider;
  const rpcUrl = typeof window === "undefined" ? getServerRpcUrl() : new URL(RPC_PROXY_PATH, window.location.origin).toString();
  readProvider = new ethers.JsonRpcProvider(rpcUrl, BASE_SEPOLIA_NETWORK, { staticNetwork: true });
  return readProvider;
}

export function shortAddr(addr: string | undefined | null, head = 6, tail = 4): string {
  if (!addr) return "-";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export function explorerAddress(addr: string): string {
  return `${EXPLORER_URL}/address/${addr}`;
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}
