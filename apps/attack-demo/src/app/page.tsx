"use client";
import { useState } from "react";
import IdentityFraud from "@/components/IdentityFraud";
import ReplayAttack from "@/components/ReplayAttack";


const TABS = [
  { id: "fraud", icon: "🎭", label: "Identity Fraud" },
  { id: "replay", icon: "🔄", label: "Replay Attack" },

] as const;

type TabId = typeof TABS[number]["id"];

export default function AttackDemoPage() {
  const [tab, setTab] = useState<TabId>("fraud");

  return (
    <div className="atk-page">
      {/* Header */}
      <div className="atk-header">
        <div className="atk-eyebrow">Security Simulation Lab</div>
        <h1 className="atk-title atk-glitch">
          Attack <span>Simulation</span> Demo
        </h1>
        <p className="atk-subtitle">
          Watch real attack scenarios play out against SecureDID&apos;s defense layers.
          Each simulation shows the attacker&apos;s perspective and how the platform blocks the attempt.
        </p>
      </div>

      {/* Stat bar */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 32,
      }}>
        {[
          { label: "Attack Types", value: "2", color: "var(--hk-red)" },
          { label: "Defense Layers", value: "7", color: "var(--hk-green)" },
          { label: "Crypto Standard", value: "P-256", color: "var(--hk-cyan)" },
          { label: "Multisig", value: "3/5", color: "var(--hk-purple)" },
        ].map((s) => (
          <div key={s.label} style={{
            padding: "16px 20px",
            background: "var(--hk-surface)",
            border: "1px solid var(--hk-border)",
            borderRadius: 12,
          }}>
            <div style={{
              font: "600 11px/1 var(--font-sans, sans-serif)",
              color: "var(--hk-fg3)",
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              marginBottom: 6,
            }}>{s.label}</div>
            <div style={{
              font: "700 24px/1 var(--font-heading, sans-serif)",
              color: s.color,
              letterSpacing: "-0.02em",
            }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="atk-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`atk-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="atk-tab__icon">{t.icon}</span>
            <span className="atk-tab__label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Attack panel */}
      <div className="atk-panel">
        {tab === "fraud" && <IdentityFraud />}
        {tab === "replay" && <ReplayAttack />}

      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center",
        marginTop: 48,
        padding: "20px 0",
        borderTop: "1px solid var(--hk-border)",
        font: "400 12px/1.5 var(--font-sans, sans-serif)",
        color: "var(--hk-fg3)",
      }}>
        SecureDID v4 — Decentralized Identity for Educational Institutions · Base Sepolia Testnet
        <br />
        All simulations are read-only demonstrations. No state changes are made on-chain.
      </div>
    </div>
  );
}
