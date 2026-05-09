"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export interface TermLine {
  text: string;
  type: "cmd" | "ok" | "err" | "warn" | "dim" | "purple" | "default";
}

interface Props {
  lines: TermLine[];
  title?: string;
}

export default function AttackTerminal({ lines, title = "attacker@kali:~" }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="atk-terminal">
      <div className="atk-terminal__bar">
        <span className="atk-terminal__dot atk-terminal__dot--r" />
        <span className="atk-terminal__dot atk-terminal__dot--y" />
        <span className="atk-terminal__dot atk-terminal__dot--g" />
        <span className="atk-terminal__title">{title}</span>
      </div>
      <div className="atk-terminal__body" ref={bodyRef}>
        {lines.map((l, i) => (
          <p key={i} className={`atk-line atk-line--${l.type}`}>{l.text}</p>
        ))}
        {lines.length > 0 && <span className="atk-cursor" />}
      </div>
    </div>
  );
}

/* ── Step progress ── */
export type StepStatus = "pending" | "active" | "done" | "fail";
export interface Step { label: string; status: StepStatus }

export function StepProgress({ steps }: { steps: Step[] }) {
  const icon = (s: StepStatus) =>
    s === "active" ? "⟳" : s === "done" ? "✓" : s === "fail" ? "✗" : "·";
  return (
    <div className="atk-steps">
      {steps.map((s, i) => (
        <div key={i} className={`atk-step ${s.status !== "pending" ? s.status : ""}`}>
          <div className="atk-step__icon">{icon(s.status)}</div>
          <div className="atk-step__text">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Verdict banner ── */
export function Verdict({ blocked, title, sub }: { blocked: boolean; title: string; sub: string }) {
  return (
    <div className={`atk-verdict ${blocked ? "atk-verdict--blocked" : "atk-verdict--breached"}`}>
      <div className="atk-verdict__shield">{blocked ? "🛡️" : "💀"}</div>
      <div className="atk-verdict__title">{title}</div>
      <div className="atk-verdict__sub">{sub}</div>
    </div>
  );
}

/* ── Defense explanation ── */
export function DefenseCard({ items }: { items: string[] }) {
  return (
    <div className="atk-defense">
      <div className="atk-defense__title">🔒 How SecureDID Defends</div>
      <ul className="atk-defense__list">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}

/* ── Typing simulation hook ── */
export function useSimulation() {
  const [lines, setLines] = useState<TermLine[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setLines([]);
    setSteps([]);
    setRunning(false);
    setDone(false);
    setTimeout(() => { cancelRef.current = false; }, 50);
  }, []);

  const addLine = useCallback((line: TermLine) => {
    setLines(prev => [...prev, line]);
  }, []);

  const updateStep = useCallback((idx: number, status: StepStatus) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, status } : s));
  }, []);

  const wait = useCallback((ms: number) => {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(cancelRef.current), ms);
    });
  }, []);

  return { lines, steps, setSteps, running, setRunning, done, setDone, reset, addLine, updateStep, wait, cancelRef };
}
