"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { ethers, BrowserProvider } from "ethers";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { CHAIN_ID, CHAIN_NAME, CHAIN_ID_HEX, DEFAULT_RPC_URL, RPC_PROXY_PATH, switchToBaseSepolia } from "../chain";

interface WalletState {
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  getSigner: () => Promise<ethers.JsonRpcSigner>;
}

const Ctx = createContext<WalletState | null>(null);
const WALLETCONNECT_NAME = "SecureDID";
const WALLETCONNECT_ICON = `${typeof window === "undefined" ? "" : window.location.origin}/favicon.ico`;

type WalletConnectProvider = Awaited<ReturnType<typeof EthereumProvider.init>>;
type InjectedEthereumProvider = ethers.Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

let walletConnectProvider: WalletConnectProvider | null = null;
let walletConnectListenersAttached = false;

function getInjectedEthereum(): InjectedEthereumProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: InjectedEthereumProvider }).ethereum;
  return eth ?? null;
}

function getWalletConnectProjectId(): string {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
}

function getWalletConnectRpcUrl(): string {
  if (typeof window === "undefined") return DEFAULT_RPC_URL;
  return new URL(RPC_PROXY_PATH, window.location.origin).toString();
}

async function getWalletConnectProvider(): Promise<WalletConnectProvider> {
  if (walletConnectProvider) return walletConnectProvider;

  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not configured");
  }

  walletConnectProvider = await EthereumProvider.init({
    projectId,
    chains: [CHAIN_ID],
    showQrModal: true,
    methods: ["eth_requestAccounts", "eth_accounts", "eth_chainId", "personal_sign", "eth_signTypedData_v4"],
    events: ["accountsChanged", "chainChanged", "disconnect", "connect"],
    metadata: {
      name: WALLETCONNECT_NAME,
      description: "SecureDID wallet login",
      url: typeof window === "undefined" ? "https://securedid.local" : window.location.origin,
      icons: [WALLETCONNECT_ICON || `${DEFAULT_RPC_URL}/favicon.ico`],
    },
    rpcMap: { [CHAIN_ID]: getWalletConnectRpcUrl() },
  });

  if (!walletConnectListenersAttached) {
    walletConnectProvider.on("accountsChanged", (accounts: string[]) => {
      const account = accounts[0]?.toLowerCase() ?? null;
      if (account) setWalletConnectState(account);
      else clearWalletConnectState();
    });
    walletConnectProvider.on("chainChanged", (id: string) => {
      setChainIdFromValue(id);
    });
    walletConnectProvider.on("disconnect", () => {
      clearWalletConnectState();
    });
    walletConnectListenersAttached = true;
  }

  return walletConnectProvider;
}

let setWalletConnectState: (account: string) => void = () => undefined;
let clearWalletConnectState: () => void = () => undefined;
let setChainIdFromValue: (value: string) => void = () => undefined;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress]       = useState<string | null>(null);
  const [chainId, setChainId]       = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  setWalletConnectState = setAddress;
  clearWalletConnectState = useCallback(() => {
    setAddress(null);
    setChainId(null);
  }, []);
  setChainIdFromValue = useCallback((value: string) => {
    const parsed = value.startsWith("0x") ? parseInt(value, 16) : Number(value);
    if (!Number.isNaN(parsed)) setChainId(parsed);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const wcProvider = await getWalletConnectProvider();
      await wcProvider.connect();
      const provider = new BrowserProvider(wcProvider as unknown as ethers.Eip1193Provider);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAddress((accounts as string[])[0].toLowerCase());
      const net = await provider.getNetwork();
      setChainId(Number(net.chainId));
    } catch (e) {
      const injected = getInjectedEthereum();
      if (injected) {
        try {
          const provider = new BrowserProvider(injected);
          await switchToBaseSepolia(provider);
          const accounts = await provider.send("eth_requestAccounts", []);
          setAddress((accounts as string[])[0].toLowerCase());
          const net = await provider.getNetwork();
          setChainId(Number(net.chainId));
          return;
        } catch (fallbackError) {
          setError(fallbackError instanceof Error ? fallbackError.message : "Connection failed");
          return;
        }
      }
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    void walletConnectProvider?.disconnect().catch(() => undefined);
  }, []);

  const getSigner = useCallback(async () => {
    if (walletConnectProvider) {
      const provider = new BrowserProvider(walletConnectProvider as unknown as ethers.Eip1193Provider);
      await switchToBaseSepolia(provider);
      return provider.getSigner();
    }

    const injected = getInjectedEthereum();
    if (!injected) {
      throw new Error("No wallet provider available");
    }
    const provider = new BrowserProvider(injected);
    await switchToBaseSepolia(provider);
    return provider.getSigner();
  }, []);

  useEffect(() => {
    const eth = getInjectedEthereum();
    if (!eth?.on) return;

    const onAccounts = (accs: unknown) => {
      const list = accs as string[];
      setAddress(list.length > 0 ? list[0].toLowerCase() : null);
    };
    const onChain = (id: unknown) => setChainId(parseInt(id as string, 16));

    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);

    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  return (
    <Ctx.Provider value={{
      address, chainId, connecting, error,
      connect, disconnect, getSigner,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}

export function useIsCorrectChain(): boolean {
  const { chainId } = useWallet();
  return chainId === CHAIN_ID;
}
