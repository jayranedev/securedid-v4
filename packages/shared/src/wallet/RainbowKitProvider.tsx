'use client';

import '@rainbow-me/rainbowkit/styles.css';
import React from 'react';
import {
  getDefaultConfig,
  RainbowKitProvider as RKProvider,
} from '@rainbow-me/rainbowkit';
import {
  okxWallet,
  metaMaskWallet,
  coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const config = getDefaultConfig({
  appName: 'SecureDID',
  projectId: '778c10ffa112cb5f26c27e7607bbe1f9',
  chains: [base, baseSepolia],
  wallets: [
    {
      groupName: 'Recommended',
      wallets: [metaMaskWallet, okxWallet, coinbaseWallet],
    },
  ],
  ssr: true,
});

const queryClient = new QueryClient();

export function RainbowKitProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RKProvider>
          {children}
        </RKProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
