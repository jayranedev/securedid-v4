"use client";
import { useState } from "react";
import DIDLoginButton from "@/components/DIDLoginButton";
import { useWallet } from "@/lib/wallet";

const semesterMarks = [
  { semester: "Sem I", sgpa: 8.4, subjects: [{ name: "Engineering Mathematics I", grade: "A", credits: 4 }, { name: "Engineering Physics", grade: "A+", credits: 4 }, { name: "C Programming", grade: "B+", credits: 3 }, { name: "Engineering Drawing", grade: "A", credits: 3 }] },
  { semester: "Sem II", sgpa: 8.1, subjects: [{ name: "Engineering Mathematics II", grade: "A", credits: 4 }, { name: "Engineering Chemistry", grade: "B+", credits: 4 }, { name: "Data Structures", grade: "A+", credits: 3 }, { name: "Digital Electronics", grade: "A", credits: 3 }] },
  { semester: "Sem III", sgpa: 8.7, subjects: [{ name: "Discrete Mathematics", grade: "A+", credits: 4 }, { name: "Computer Networks", grade: "A", credits: 4 }, { name: "Object Oriented Programming", grade: "A+", credits: 3 }, { name: "Database Management", grade: "A", credits: 3 }] },
  { semester: "Sem IV", sgpa: 8.9, subjects: [{ name: "Operating Systems", grade: "A+", credits: 4 }, { name: "Theory of Computation", grade: "A", credits: 4 }, { name: "Microprocessors", grade: "A", credits: 3 }, { name: "Software Engineering", grade: "A+", credits: 3 }] },
];

const gradeColors: Record<string, string> = {
  "A+": "text-emerald-700 bg-emerald-50 border-emerald-200",
  "A": "text-blue-700 bg-blue-50 border-blue-200",
  "B+": "text-indigo-700 bg-indigo-50 border-indigo-200",
  "B": "text-purple-700 bg-purple-50 border-purple-200",
};

export default function UniversityPortal() {
  const { identity } = useWallet();
  const [authed, setAuthed] = useState(false);
  const [holderName, setHolderName] = useState<string | null>(null);

  const did = identity?.did ?? "did:securedid:demo";

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">🎓</span>
            <h1 className="text-2xl font-bold text-slate-800">Goa University</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Academic Portal — Marks, CGPA & Transcripts</p>
        </div>
        {authed && (
          <button onClick={() => { setAuthed(false); setHolderName(null); }}
            className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
            Sign Out
          </button>
        )}
      </div>

      {!authed ? (
        <LoginGate onAuth={(_token, name) => { setAuthed(true); setHolderName(name); }} />
      ) : (
        <AuthenticatedView did={did} holderName={holderName ?? identity?.holderName ?? "Student"} />
      )}
    </div>
  );
}

function LoginGate({ onAuth }: { onAuth: (token: string, name: string) => void }) {
  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto text-3xl">🔐</div>
        <h2 className="text-xl font-bold text-slate-800">University Login</h2>
        <p className="text-sm text-slate-500">
          Authenticate with your SecureDID wallet issued by your college. Your transcript is only accessible to you.
        </p>
        <DIDLoginButton domain="university.goa.edu" onSuccess={(token, name) => onAuth(token, name)} />
        <p className="text-xs text-gray-400">Cross-institution DID authentication · W3C Verifiable Credentials</p>
      </div>

      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-purple-800">Why DID login?</p>
        <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
          <li>Your credentials are cryptographically signed by your college</li>
          <li>The university verifies them independently — no shared database</li>
          <li>Private key never leaves your device</li>
          <li>One-click login across all affiliated institutions</li>
        </ul>
      </div>
    </div>
  );
}

function AuthenticatedView({ did, holderName }: { did: string; holderName: string }) {
  const [selectedSem, setSelectedSem] = useState<number | null>(null);
  const cgpa = (semesterMarks.reduce((s, sem) => s + sem.sgpa, 0) / semesterMarks.length).toFixed(2);

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-5 text-white flex items-center justify-between">
        <div>
          <p className="text-sm text-purple-200">Authenticated student</p>
          <p className="text-xl font-bold">{holderName}</p>
          <p className="text-xs font-mono text-purple-200 mt-1">{did.slice(0, 32)}…</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-extrabold">{cgpa}</p>
          <p className="text-sm text-purple-200">CGPA</p>
        </div>
      </div>

      {/* SGPA trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-4 text-sm">Semester Performance</h3>
        <div className="flex items-end gap-3 h-24">
          {semesterMarks.map((sem) => {
            const h = Math.round(((sem.sgpa - 7) / 3) * 100);
            return (
              <button key={sem.semester} onClick={() => setSelectedSem(selectedSem === semesterMarks.indexOf(sem) ? null : semesterMarks.indexOf(sem))}
                className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-purple-700">{sem.sgpa}</span>
                <div className={`w-full rounded-t-md transition-all ${selectedSem === semesterMarks.indexOf(sem) ? "bg-purple-600" : "bg-purple-200"}`}
                  style={{ height: `${h}%` }} />
                <span className="text-xs text-gray-500">{sem.semester}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">Click a bar to expand subject marks</p>
      </div>

      {/* Subject marks */}
      {selectedSem !== null && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
            <h3 className="font-semibold text-purple-800 text-sm">{semesterMarks[selectedSem].semester} — SGPA {semesterMarks[selectedSem].sgpa}</h3>
          </div>
          <table className="w-full">
            <thead className="text-xs text-gray-500 border-b border-gray-100">
              <tr><th className="text-left px-4 py-2">Subject</th><th className="text-center px-4 py-2">Credits</th><th className="text-center px-4 py-2">Grade</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {semesterMarks[selectedSem].subjects.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{s.name}</td>
                  <td className="px-4 py-2.5 text-center text-sm text-gray-500">{s.credits}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${gradeColors[s.grade] ?? "text-gray-600 bg-gray-50 border-gray-200"}`}>
                      {s.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Download */}
      <div className="flex gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1 text-center space-y-2">
          <p className="text-2xl">📄</p>
          <p className="text-sm font-medium text-slate-700">Official Transcript</p>
          <p className="text-xs text-gray-400">DID-signed PDF transcript</p>
          <button className="w-full bg-purple-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-purple-700">
            Download PDF
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1 text-center space-y-2">
          <p className="text-2xl">🪙</p>
          <p className="text-sm font-medium text-slate-700">Migration Certificate</p>
          <p className="text-xs text-gray-400">Verified JSON credential bundle</p>
          <button className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700">
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}
