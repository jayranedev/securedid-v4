import "./globals.css";
import "@securedid/shared/globals.css";
import type { Metadata } from "next";
import { Inter, Manrope, Roboto_Mono } from "next/font/google";

const inter   = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-heading", display: "swap", weight: ["400","500","600","700","800"] });
const mono    = Roboto_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400","500"] });

export const metadata: Metadata = {
  title: "SecureDID — Attack Simulation Lab",
  description: "Live attack simulations demonstrating how SecureDID defends against identity fraud, impersonation, replay attacks, and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${manrope.variable} ${mono.variable}`}>
      <body className="atk-scanlines" style={{ minHeight: "100vh" }}>
        {/* Top nav bar */}
        <nav style={{
          position: "sticky", top: 0, zIndex: 50,
          height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px",
          background: "rgba(10,14,23,0.85)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          borderBottom: "1px solid var(--hk-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <span style={{
              font: "700 15px/1 var(--font-heading, 'Manrope', sans-serif)",
              color: "#fff",
              letterSpacing: "-0.01em",
            }}>
              SecureDID
            </span>
            <span style={{
              font: "500 11px/1 var(--hk-mono)",
              color: "var(--hk-red)",
              background: "rgba(239,68,68,0.12)",
              padding: "3px 8px",
              borderRadius: 6,
              letterSpacing: "0.06em",
            }}>
              ATTACK LAB
            </span>
          </div>
          <div style={{
            font: "400 12px/1 var(--hk-mono)",
            color: "var(--hk-fg3)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--hk-green)",
              boxShadow: "0 0 8px var(--hk-green)",
            }} />
            Base Sepolia · Chain 84532
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
