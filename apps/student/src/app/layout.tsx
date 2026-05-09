import "./globals.css";
import "@securedid/shared/globals.css";
import type { Metadata } from "next";
import { Inter, Manrope, Roboto_Mono } from "next/font/google";
import { RainbowKitProvider, ConnectButton, EthereumGuard } from "@securedid/shared";
import Link from "next/link";

const inter    = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const manrope  = Manrope({ subsets: ["latin"], variable: "--font-heading", display: "swap", weight: ["400","500","600","700","800"] });
const mono     = Roboto_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400","500"] });

export const metadata: Metadata = {
  title: "SecureDID Student",
  description: "Access your decentralized student identity on Base Sepolia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-app="student" className={`${inter.variable} ${manrope.variable} ${mono.variable}`}>
      <head><EthereumGuard /></head>
      <body style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
        <RainbowKitProvider>
          <nav className="sd-nav">
            <div className="sd-nav__left">
              <Link href="/" className="sd-brand">SecureDID</Link>
              <div className="sd-nav-tabs">
                <Link href="/" className="sd-nav-tab active">Dashboard</Link>
                <Link href="/" className="sd-nav-tab">Registry</Link>
                <Link href="/" className="sd-nav-tab">Governance</Link>
                <Link href="/" className="sd-nav-tab">Compliance</Link>
              </div>
            </div>
            <div className="sd-nav__right">
              <ConnectButton />
            </div>
          </nav>
          <main>{children}</main>
        </RainbowKitProvider>
      </body>
    </html>
  );
}
