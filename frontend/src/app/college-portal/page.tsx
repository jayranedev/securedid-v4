"use client";
import { useState } from "react";
import DIDLoginButton from "@/components/DIDLoginButton";
import { useWallet } from "@/lib/wallet";

const notices = [
  { id: 1, title: "Mid-Semester Exam Schedule Released", date: "2025-04-10", category: "Examination", content: "The timetable for mid-semester examinations has been uploaded to the portal. Students must bring their ID cards." },
  { id: 2, title: "Annual Sports Day — 28th April", date: "2025-04-08", category: "Event", content: "All students are encouraged to participate. Registration closes April 20. Online sign-up via the sports portal." },
  { id: 3, title: "Library Timing Extended", date: "2025-04-05", category: "Notice", content: "The central library will remain open until 10 PM on all working days until the end of the semester." },
  { id: 4, title: "Project Submission Deadline Extended", date: "2025-04-03", category: "Academic", content: "Final year project submission deadline extended to May 15. Coordinate with your guide for the updated schedule." },
];

const attendance: Record<string, { subject: string; present: number; total: number }[]> = {
  "did:securedid:demo": [
    { subject: "Data Structures", present: 38, total: 42 },
    { subject: "Computer Networks", present: 30, total: 40 },
    { subject: "Operating Systems", present: 35, total: 38 },
    { subject: "Database Systems", present: 40, total: 42 },
    { subject: "Software Engineering", present: 28, total: 32 },
  ],
};

export default function CollegePortal() {
  const { identity } = useWallet();
  const [authed, setAuthed] = useState(false);
  const [holderName, setHolderName] = useState<string | null>(null);

  const did = identity?.did ?? null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">🏫</span>
            <h1 className="text-2xl font-bold text-slate-800">Don Bosco College of Engineering</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Student Portal — Attendance, Events & Notices</p>
        </div>
        {authed && (
          <button onClick={() => { setAuthed(false); setHolderName(null); }}
            className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
            Sign Out
          </button>
        )}
      </div>

      {/* Login gate */}
      {!authed ? (
        <LoginGate onAuth={(_token, name) => { setAuthed(true); setHolderName(name); }} />
      ) : (
        <AuthenticatedView did={did ?? "did:securedid:demo"} holderName={holderName ?? identity?.holderName ?? "Student"} />
      )}
    </div>
  );
}

function LoginGate({ onAuth }: { onAuth: (token: string, name: string) => void }) {
  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-3xl">🔐</div>
        <h2 className="text-xl font-bold text-slate-800">Login with DID Wallet</h2>
        <p className="text-sm text-slate-500">
          Use your SecureDID wallet to authenticate. Your identity is verified cryptographically — no password needed.
        </p>
        <DIDLoginButton domain="college.dbce.edu" onSuccess={(token, name) => onAuth(token, name)} />
        <p className="text-xs text-gray-400">5-check VP verification · Zero-knowledge auth · ECDSA P-256</p>
      </div>

      {/* Demo notice cards */}
      <div className="space-y-2">
        {notices.slice(0, 2).map((n) => (
          <BlurredNoticeCard key={n.id} notice={n} />
        ))}
        <p className="text-center text-xs text-gray-400 py-2">Login to view all notices and attendance</p>
      </div>
    </div>
  );
}

function BlurredNoticeCard({ notice: n }: { notice: typeof notices[0] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 opacity-50 blur-[1px] select-none">
      <div className="flex justify-between items-start">
        <p className="font-medium text-sm text-slate-700">{n.title}</p>
        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{n.category}</span>
      </div>
      <p className="text-xs text-gray-400 mt-1">{n.date}</p>
    </div>
  );
}

function AuthenticatedView({ did, holderName }: { did: string; holderName: string }) {
  const [tab, setTab] = useState<"attendance" | "events" | "notices">("attendance");
  const studentAttendance = attendance[did] ?? attendance["did:securedid:demo"];

  return (
    <div className="space-y-5">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 text-white flex items-center justify-between">
        <div>
          <p className="text-sm text-indigo-200">Welcome back,</p>
          <p className="text-xl font-bold">{holderName}</p>
          <p className="text-xs font-mono text-indigo-200 mt-1">{did.slice(0, 32)}…</p>
        </div>
        <div className="text-right">
          <span className="bg-green-400 text-green-900 text-xs font-semibold px-2 py-1 rounded-full">✓ Verified</span>
          <p className="text-xs text-indigo-200 mt-2">Auth via ECDSA P-256</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["attendance", "events", "notices"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "attendance" && <AttendanceView attendance={studentAttendance} />}
      {tab === "events" && <EventsView />}
      {tab === "notices" && <NoticesView />}
    </div>
  );
}

function AttendanceView({ attendance: att }: { attendance: { subject: string; present: number; total: number }[] }) {
  const overall = att.reduce((sum, a) => sum + a.present, 0);
  const total = att.reduce((sum, a) => sum + a.total, 0);
  const pct = Math.round((overall / total) * 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className={`text-3xl font-bold ${pct >= 75 ? "text-green-600" : "text-red-600"}`}>{pct}%</p>
          <p className="text-xs text-gray-500 mt-1">Overall Attendance</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-slate-800">{overall}</p>
          <p className="text-xs text-gray-500 mt-1">Classes Attended</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-slate-800">{total}</p>
          <p className="text-xs text-gray-500 mt-1">Total Classes</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {att.map((a) => {
          const p = Math.round((a.present / a.total) * 100);
          return (
            <div key={a.subject} className="px-4 py-3 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">{a.subject}</p>
                <p className="text-xs text-gray-400">{a.present}/{a.total} classes</p>
              </div>
              <div className="w-24 bg-gray-100 rounded-full h-2">
                <div className={`h-full rounded-full ${p >= 75 ? "bg-green-500" : "bg-red-400"}`} style={{ width: `${p}%` }} />
              </div>
              <span className={`text-sm font-semibold w-10 text-right ${p >= 75 ? "text-green-600" : "text-red-600"}`}>{p}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventsView() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {[
        { name: "Technova 2025", date: "April 25–26", venue: "Main Auditorium", type: "Technical Fest", color: "bg-purple-50 border-purple-200" },
        { name: "Annual Sports Day", date: "April 28", venue: "Sports Ground", type: "Sports", color: "bg-orange-50 border-orange-200" },
        { name: "Industry Visit — Infosys Pune", date: "May 5", venue: "Infosys Campus", type: "Industrial Visit", color: "bg-blue-50 border-blue-200" },
        { name: "Alumni Interaction Session", date: "May 10", venue: "Seminar Hall A", type: "Career", color: "bg-green-50 border-green-200" },
      ].map((ev) => (
        <div key={ev.name} className={`rounded-xl border p-5 space-y-1 ${ev.color}`}>
          <span className="text-xs font-medium text-gray-500">{ev.type}</span>
          <h3 className="font-semibold text-slate-800">{ev.name}</h3>
          <p className="text-sm text-gray-600">📅 {ev.date}</p>
          <p className="text-sm text-gray-600">📍 {ev.venue}</p>
        </div>
      ))}
    </div>
  );
}

function NoticesView() {
  return (
    <div className="space-y-3">
      {notices.map((n) => (
        <div key={n.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm text-slate-800">{n.title}</p>
            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100">{n.category}</span>
          </div>
          <p className="text-xs text-gray-400">{n.date}</p>
          <p className="text-sm text-gray-600">{n.content}</p>
        </div>
      ))}
    </div>
  );
}
