"use client";

const STEPS = [
  { n: 1, label: "Institution", sub: "Name & website" },
  { n: 2, label: "Panelists",   sub: "Addresses & threshold" },
  { n: 3, label: "Review",      sub: "Deploy" },
];

export function Stepper({ current }: { current: number }) {
  return (
    <div className="sd-wizard">
      {STEPS.map((s) => {
        const done   = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className={`sd-wstep${done ? " done" : ""}${active ? " active" : ""}`}>
            <div className="sd-wstep__num">{done ? "✓" : s.n}</div>
            <div>
              <div className="sd-wstep__title">{s.label}</div>
              <div className="sd-wstep__sub">{s.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
