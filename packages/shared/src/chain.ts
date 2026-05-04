import { ethers, BrowserProvider } from "ethers";

export const CHAIN_ID = 84532;
export const CHAIN_ID_HEX = "0x14A34";
export const CHAIN_NAME = "Base Sepolia";
export const RPC_PROXY_PATH = "/api/rpc";
export const EXPLORER_URL = "https://sepolia.basescan.org";

function getServerRpcUrl(): string {
  return process.env.BASE_RPC_URL ?? "https://base-sepolia.g.alchemy.com/v2/demo";
}

export function getReadProvider(): ethers.JsonRpcProvider {
  const rpcUrl = typeof window === "undefined" ? getServerRpcUrl() : new URL(RPC_PROXY_PATH, window.location.origin).toString();
  return new ethers.JsonRpcProvider(rpcUrl);
}

export async function switchToBaseSepolia(provider: BrowserProvider): Promise<void> {
  const network = await provider.getNetwork();
  if (Number(network.chainId) === CHAIN_ID) return;

  const eth = (window as unknown as { ethereum: { request: (a: unknown) => Promise<unknown> } }).ethereum;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_ID_HEX,
        chainName: CHAIN_NAME,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: [getServerRpcUrl()],
        blockExplorerUrls: [EXPLORER_URL],
      }],
    });
  }
}

export async function connectWallet(): Promise<string> {
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    throw new Error("MetaMask not installed");
  }
  const eth = (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum;
  const provider = new BrowserProvider(eth);
  await switchToBaseSepolia(provider);
  const accounts = await provider.send("eth_requestAccounts", []);
  return (accounts as string[])[0].toLowerCase();
}

export function shortAddr(addr: string | undefined | null, head = 6, tail = 4): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function explorerAddress(addr: string): string {
  return `${EXPLORER_URL}/address/${addr}`;
}

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}
