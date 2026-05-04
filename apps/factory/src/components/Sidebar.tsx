"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",        label: "My Institutions", icon: "◉" },
  { href: "/create",  label: "Create Registry", icon: "+" },
  { href: "/explore", label: "Explore All",     icon: "◎" },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-slate-950 font-bold text-sm">
            S
          </span>
          <div>
            <div className="font-bold text-white text-sm leading-tight">SecureDID</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Factory</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((n) => {
          const active = path === n.href || (n.href !== "/" && path.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <span className="w-5 text-center text-brand-400">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800 text-[10px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Base Sepolia · 84532
        </div>
      </div>
    </aside>
  );
}
