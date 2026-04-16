"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";

// ── Portal definitions ────────────────────────────────────────────────────────

function usePortal() {
  const path = usePathname();
  if (path.startsWith("/admin") || path === "/analytics" || path === "/attack-demo") {
    return "admin";
  }
  if (path.startsWith("/college-portal")) return "college";
  if (path.startsWith("/university-portal")) return "university";
  return "student"; // /, /register, /wallet
}

// ── Admin nav ─────────────────────────────────────────────────────────────────

function AdminNav({ path }: { path: string }) {
  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/governance", label: "Governance" },
    { href: "/attack-demo", label: "Attack Demo" },
    { href: "/analytics", label: "Analytics" },
  ];
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-16 gap-1 overflow-x-auto">
        <Link href="/admin" className="mr-4 shrink-0 flex items-center gap-2">
          <span className="font-bold text-white text-lg">🏛️ Admin Panel</span>
          <span className="text-xs text-slate-400 font-medium">SecureDID v4</span>
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap
              ${path === l.href ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

// ── College portal nav ────────────────────────────────────────────────────────

function CollegeNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-emerald-800/95 backdrop-blur border-b border-emerald-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-16 gap-4">
        <Link href="/college-portal" className="shrink-0 flex items-center gap-2">
          <span className="font-bold text-white text-lg">🎓 College Portal</span>
          <span className="text-xs text-emerald-200 font-medium">Don Bosco College of Engineering</span>
        </Link>
        <div className="ml-auto">
          <span className="text-xs text-emerald-200 bg-emerald-700/50 px-2 py-1 rounded-full">
            Student Verification
          </span>
        </div>
      </div>
    </nav>
  );
}

// ── University portal nav ─────────────────────────────────────────────────────

function UniversityNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-blue-900/95 backdrop-blur border-b border-blue-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-16 gap-4">
        <Link href="/university-portal" className="shrink-0 flex items-center gap-2">
          <span className="font-bold text-white text-lg">🏫 University Portal</span>
          <span className="text-xs text-blue-200 font-medium">Credential Verification System</span>
        </Link>
        <div className="ml-auto">
          <span className="text-xs text-blue-200 bg-blue-700/50 px-2 py-1 rounded-full">
            Academic Records
          </span>
        </div>
      </div>
    </nav>
  );
}

// ── Student nav ───────────────────────────────────────────────────────────────

function StudentNav({ path }: { path: string }) {
  const { identity } = useWallet();
  const links = [
    { href: "/register", label: "Register" },
    { href: "/wallet", label: "My Wallet" },
  ];
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-16 gap-1 overflow-x-auto">
        <Link href="/" className="mr-3 shrink-0 flex items-center gap-1">
          <span className="font-bold text-indigo-700 text-lg">🆔 SecureDID</span>
          <span className="ml-1 text-xs text-purple-500 font-semibold bg-purple-50 px-1.5 py-0.5 rounded">v4</span>
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap
              ${path === l.href ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {l.label}
          </Link>
        ))}
        <div className="ml-auto shrink-0">
          {identity ? (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
              ✓ {identity.holderName.split(" ")[0]}
            </span>
          ) : (
            <Link href="/wallet" className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-2 py-1 rounded-full transition">
              Connect Wallet
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function Navbar() {
  const path = usePathname();
  const portal = usePortal();

  if (portal === "admin") return <AdminNav path={path} />;
  if (portal === "college") return <CollegeNav />;
  if (portal === "university") return <UniversityNav />;
  return <StudentNav path={path} />;
}
