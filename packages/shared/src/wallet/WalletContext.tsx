"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { ethers, BrowserProvider } from "ethers";
import { CHAIN_ID, connectWallet, switchToBaseSepolia } from "../chain";

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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress]       = useState<string | null>(null);
  const [chainId, setChainId]       = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      const eth = (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum;
      const provider = new BrowserProvider(eth);
      const net = await provider.getNetwork();
      setChainId(Number(net.chainId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
  }, []);

  const getSigner = useCallback(async () => {
    if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
      throw new Error("MetaMask not installed");
    }
    const eth = (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum;
    const provider = new BrowserProvider(eth);
    await switchToBaseSepolia(provider);
    return provider.getSigner();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as unknown as { ethereum?: { on?: (e: string, f: (...a: unknown[]) => void) => void; removeListener?: (e: string, f: (...a: unknown[]) => void) => void } }).ethereum;
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
