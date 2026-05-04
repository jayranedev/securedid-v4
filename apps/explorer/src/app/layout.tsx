import "./globals.css";
import "@securedid/shared/globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, DM_Serif_Display } from "next/font/google";
import { WalletProvider, ConnectButton, EthereumGuard } from "@securedid/shared";
import Link from "next/link";

const inter    = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono     = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400","500","600"] });
const display  = DM_Serif_Display({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: "400" });

export const metadata: Metadata = {
  title: "SecureDID Explorer",
  description: "Browse on-chain DID events and registry activity.",
};

const ShieldIcon = () => (
  <svg width="22" height="22" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M16 2.5 L27 6.2 V15.5 C27 22.4 22.3 27.6 16 29.5 C9.7 27.6 5 22.4 5 15.5 V6.2 L16 2.5 Z" fillOpacity="0.12" fill="currentColor" />
    <rect x="10.5" y="12.5" width="6.5" height="5" rx="2.5" />
    <rect x="15" y="14.5" width="6.5" height="5" rx="2.5" />
  </svg>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-app="explorer" className={`${inter.variable} ${mono.variable} ${display.variable}`}>
      <head><EthereumGuard /></head>
      <body style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
        <WalletProvider>
          <nav className="sd-nav">
            <div className="sd-nav__left">
              <Link href="/" className="sd-brand"><ShieldIcon />Secure<em>DID</em></Link>
              <span className="sd-nav-sep" />
              <span className="sd-nav-app">Explorer</span>
              <div className="sd-nav-tabs">
                <Link href="/" className="sd-nav-tab">Registries</Link>
              </div>
            </div>
            <div className="sd-nav__right">
              <ConnectButton />
            </div>
          </nav>
          <main>{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
