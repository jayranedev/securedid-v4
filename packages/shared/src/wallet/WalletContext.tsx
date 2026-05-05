"use client";

import { ReactNode, useCallback } from "react";
import { ethers, BrowserProvider } from "ethers";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { CHAIN_ID } from "../chain";

interface WalletState {
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  getSigner: () => Promise<ethers.JsonRpcSigner>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useWallet(): WalletState {
  const { address, chainId, isConnecting } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { openConnectModal } = useConnectModal();

  const connect = useCallback(async () => {
    if (!openConnectModal) {
      throw new Error("Wallet connection is not ready");
    }
    openConnectModal();
  }, [openConnectModal]);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  const getSigner = useCallback(async () => {
    if (!walletClient) {
      throw new Error("Connect wallet first");
    }

    if (walletClient.chain.id !== CHAIN_ID) {
      await switchChainAsync({ chainId: CHAIN_ID });
    }

    const provider = new BrowserProvider(walletClient.transport as unknown as ethers.Eip1193Provider);
    return provider.getSigner(walletClient.account.address);
  }, [switchChainAsync, walletClient]);

  return {
    address: address?.toLowerCase() ?? null,
    chainId: chainId ?? null,
    connecting: isConnecting,
    error: null,
    connect,
    disconnect,
    getSigner,
  };
}

export function useIsCorrectChain(): boolean {
  const { chainId } = useWallet();
  return chainId === CHAIN_ID;
}
