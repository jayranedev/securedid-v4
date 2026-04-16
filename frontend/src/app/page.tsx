import Link from "next/link";

const features = [
  { icon: "🔐", title: "Zero-Knowledge Auth", desc: "5-check VP verification. Private keys never leave the device." },
  { icon: "🔗", title: "Blockchain-Anchored", desc: "DID document hashes immutably recorded on Base Sepolia testnet." },
  { icon: "🌐", title: "IPFS Storage (v4)", desc: "Encrypted VCs stored on IPFS — decentralized and censorship-resistant." },
  { icon: "🗝️", title: "Shamir Multisig", desc: "3-of-5 panelist threshold — no single admin can issue or revoke IDs." },
  { icon: "🛡️", title: "Revocation Engine", desc: "2-of-5 bitstring revocation + on-chain status for trustless checks." },
  { icon: "📊", title: "Live Analytics", desc: "Benchmark every operation: DID creation, auth, revocation timing." },
];

const flow = [
  { step: "1", label: "Register", desc: "Student submits request with secret key" },
  { step: "2", label: "CSV Verify", desc: "Backend matches against authorized CSV" },
  { step: "3", label: "3-of-5 Approve", desc: "Panelists submit Shamir key shares" },
  { step: "4", label: "DID + VC Issued", desc: "W3C credential signed & anchored" },
  { step: "5", label: "Wallet Import", desc: "Student stores identity in secure wallet" },
  { step: "6", label: "One-Click Auth", desc: "VP signed → 5 checks → JWT issued" },
];

export default function LandingPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-20">

      {/* Hero */}
      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm px-4 py-1.5 rounded-full font-medium">
          <span>🚀</span> SecureDID v4 — Privacy-Preserving Decentralized Identity
        </div>
        <h1 className="text-5xl font-extrabold text-slate-900 leading-tight">
          Student Identity,<br />
          <span className="text-indigo-600">Decentralized & Encrypted</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto">
          W3C Verifiable Credentials · ECDSA P-256 · Shamir SSS · IPFS Storage · Base Sepolia · AES-256-GCM
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/register"
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition shadow-md">
            Register as Student
          </Link>
          <Link href="/wallet"
            className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition shadow-sm">
            Open Wallet 🔐
          </Link>
          <Link href="/admin"
            className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition shadow-sm">
            Admin Panel
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-2xl font-bold text-slate-800 text-center mb-8">How It Works</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {flow.map((f) => (
            <div key={f.step} className="text-center space-y-2 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center mx-auto">
                {f.step}
              </div>
              <p className="font-semibold text-sm text-slate-800">{f.label}</p>
              <p className="text-xs text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-2xl font-bold text-slate-800 text-center mb-8">What Makes SecureDID Secure</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition space-y-2">
              <span className="text-3xl">{f.icon}</span>
              <h3 className="font-semibold text-slate-800">{f.title}</h3>
              <p className="text-sm text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Portals */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Demo Portals</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <PortalCard href="/college-portal" emoji="🏫" title="College Portal"
            desc="Attendance, events, notices — login with one click using your DID wallet." color="indigo" />
          <PortalCard href="/university-portal" emoji="🎓" title="University Portal"
            desc="Semester marks, CGPA, marksheet download — secure DID authentication." color="purple" />
          <PortalCard href="/attack-demo" emoji="⚠️" title="Attack Demo"
            desc="Watch live: fake registration, impersonation, and replay attacks — all blocked." color="red" />
        </div>
      </section>

      {/* Tech stack */}
      <section className="text-center">
        <h2 className="text-xl font-bold text-slate-700 mb-4">Tech Stack</h2>
        <div className="flex flex-wrap gap-2 justify-center">
          {["FastAPI", "PostgreSQL", "SQLAlchemy 2", "Alembic", "ECDSA P-256", "Shamir SSS",
            "Web Crypto API", "Base Sepolia", "IPFS / Pinata", "AES-256-GCM", "Next.js 14", "Tailwind CSS", "Recharts",
          ].map((t) => (
            <span key={t} className="bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1 rounded-full border border-slate-200">
              {t}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Built by Jay Rane · Don Bosco College of Engineering, Goa
        </p>
      </section>
    </div>
  );
}

function PortalCard({ href, emoji, title, desc, color }: {
  href: string; emoji: string; title: string; desc: string; color: string;
}) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 border-indigo-200 hover:bg-indigo-100",
    purple: "bg-purple-50 border-purple-200 hover:bg-purple-100",
    red: "bg-red-50 border-red-200 hover:bg-red-100",
  };
  return (
    <Link href={href} className={`block rounded-xl border p-5 transition space-y-2 ${colors[color]}`}>
      <span className="text-3xl">{emoji}</span>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500">{desc}</p>
    </Link>
  );
}
