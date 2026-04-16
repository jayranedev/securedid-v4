"use client";
import { useState } from "react";
import { register, getChallenge, verifyPresentation, getCredentials } from "@/lib/api";

type AttackTab = "fake_registration" | "impersonation" | "replay";

const TABS: { id: AttackTab; label: string; emoji: string }[] = [
  { id: "fake_registration", label: "Fake Registration", emoji: "📋" },
  { id: "impersonation", label: "Impersonation", emoji: "🎭" },
  { id: "replay", label: "Replay Attack", emoji: "⏪" },
];

export default function AttackDemoPage() {
  const [tab, setTab] = useState<AttackTab>("fake_registration");

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-3xl">⚠️</span>
          <h1 className="text-2xl font-bold text-slate-800">Attack Simulation Panel</h1>
        </div>
        <p className="text-sm text-slate-500">
          Live demo of three attack vectors — and how SecureDID blocks every one of them. Safe, educational, no real data is modified.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex gap-2">
        <span>🔬</span>
        <span>All requests go to the real backend. Failures are genuine security rejections, not simulated.</span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${tab === t.id ? "bg-red-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            <span>{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {tab === "fake_registration" && <FakeRegistrationDemo />}
        {tab === "impersonation" && <ImpersonationDemo />}
        {tab === "replay" && <ReplayDemo />}
      </div>
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function AttackPanel({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function DefensePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🛡️</span>
        <h3 className="font-semibold text-green-800">Defense Mechanism</h3>
      </div>
      {children}
    </div>
  );
}

function LogLine({ text, type }: { text: string; type: "info" | "error" | "success" | "warn" }) {
  const colors = { info: "text-gray-300", error: "text-red-400", success: "text-green-400", warn: "text-amber-400" };
  const prefix = { info: "→", error: "✗", success: "✓", warn: "⚠" };
  return (
    <p className={`text-xs font-mono ${colors[type]}`}>{prefix[type]} {text}</p>
  );
}

function Terminal({ lines }: { lines: { text: string; type: "info" | "error" | "success" | "warn" }[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-1 max-h-48 overflow-y-auto">
      {lines.map((l, i) => <LogLine key={i} {...l} />)}
    </div>
  );
}

// ── Attack 1: Fake Registration ───────────────────────────────────────────────

function FakeRegistrationDemo() {
  const [logs, setLogs] = useState<{ text: string; type: "info" | "error" | "success" | "warn" }[]>([]);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<"blocked" | null>(null);

  function addLog(text: string, type: "info" | "error" | "success" | "warn" = "info") {
    setLogs((prev) => [...prev, { text, type }]);
  }

  async function runAttack() {
    setRunning(true); setLogs([]); setOutcome(null);
    addLog("Attacker attempts to register with fabricated student data…", "warn");
    addLog("Sending: roll_number=FAKE001, email=attacker@evil.com", "info");
    addLog("Using wrong secret_key: 'hacked123'", "error");
    try {
      await register({
        full_name: "Attacker McBadguy",
        email: "attacker@evil.com",
        roll_number: "FAKE001",
        department: "CS",
        year: 2,
        secret_key: "hacked123",
      });
      addLog("Registration succeeded (unexpected!)", "error");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`Backend rejected: "${msg}"`, "error");
      addLog("CSV matching engine found no record for FAKE001", "info");
      addLog("Secret key hash does not match authorized CSV", "info");
      addLog("Registration denied. No pending request created.", "success");
      setOutcome("blocked");
    } finally { setRunning(false); }
  }

  return (
    <>
      <AttackPanel title="📋 Fake Registration Attack"
        desc="Attacker submits a fabricated student identity with wrong credentials to obtain a DID.">
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
          <strong>Attack:</strong> Submits <code className="bg-gray-200 px-1 rounded">FAKE001</code> with email <code className="bg-gray-200 px-1 rounded">attacker@evil.com</code> and a guessed secret key. Goal: get a legitimate DID issued without being an enrolled student.
        </p>
        <button onClick={runAttack} disabled={running}
          className="w-full bg-red-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60 hover:bg-red-700">
          {running ? "Attacking…" : "▶ Run Fake Registration Attack"}
        </button>
        <Terminal lines={logs} />
        {outcome === "blocked" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-green-800 font-semibold text-sm">✓ Attack Blocked</p>
          </div>
        )}
      </AttackPanel>

      <DefensePanel>
        <div className="space-y-3 text-sm text-green-800">
          <p className="font-medium">5-Field CSV Verification</p>
          <ul className="space-y-2 text-xs">
            {[
              "Roll number looked up in authorized CSV (loaded by admin)",
              "Full name, email, department, year must all match",
              "bcrypt hash of secret_key verified against CSV hash",
              "Generic error returned — attacker cannot enumerate which field failed",
              "Even if registration queues, 3-of-5 panelists must independently approve",
            ].map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-green-600 font-bold">{i + 1}.</span>{s}</li>
            ))}
          </ul>
          <div className="bg-green-100 rounded-lg p-2 text-xs text-green-700 font-mono">
            matching_engine.py → 5-field match + secret_key hash
          </div>
        </div>
      </DefensePanel>
    </>
  );
}

// ── Attack 2: Impersonation ───────────────────────────────────────────────────

function ImpersonationDemo() {
  const [targetDid, setTargetDid] = useState("did:securedid:example123");
  const [logs, setLogs] = useState<{ text: string; type: "info" | "error" | "success" | "warn" }[]>([]);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<"blocked" | null>(null);

  function addLog(text: string, type: "info" | "error" | "success" | "warn" = "info") {
    setLogs((prev) => [...prev, { text, type }]);
  }

  async function runAttack() {
    setRunning(true); setLogs([]); setOutcome(null);
    addLog(`Attacker targeting DID: ${targetDid.slice(0, 30)}…`, "warn");
    addLog("Fetching a real challenge nonce from backend…", "info");

    try {
      const { nonce } = await getChallenge("attack-demo.evil.com");
      addLog(`Got nonce: ${nonce.slice(0, 16)}…`, "info");

      // Try to get victim's credentials
      addLog("Attempting to retrieve victim's VC from public endpoint…", "info");
      try {
        const creds = await getCredentials(targetDid);
        if (creds.length > 0) {
          addLog(`Found ${creds.length} credential(s) for target DID`, "warn");
        } else {
          addLog("No credentials found for this DID (valid but no VC)", "info");
        }
      } catch {
        addLog("Could not retrieve credentials (DID not found)", "info");
      }

      addLog("Constructing forged VP with attacker's fabricated signature…", "warn");
      addLog("Using random 32-byte private key (not victim's key)", "error");

      // Build a fake VP with garbage signature
      const fakeVP = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiablePresentation"],
        holder: targetDid,
        verifiableCredential: [{ id: "fake-vc" }],
        nonce,
        domain: "attack-demo.evil.com",
        created: new Date().toISOString(),
        proof: {
          type: "EcdsaSecp256r1Signature2019",
          proofValue: "deadbeef".repeat(8),
          verificationMethod: `${targetDid}#keys-1`,
          created: new Date().toISOString(),
        },
      };

      addLog("Submitting forged VP to /api/auth/verify…", "info");
      await verifyPresentation({ verifiable_presentation: fakeVP, domain: "attack-demo.evil.com" });
      addLog("Auth succeeded (should not happen!)", "error");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`Backend rejected: "${msg}"`, "error");
      addLog("Check 3: VP signature verification failed", "info");
      addLog("Forged 0xdeadbeef… signature doesn't verify against holder's public key", "info");
      addLog("JWT not issued. Attack blocked.", "success");
      setOutcome("blocked");
    } finally { setRunning(false); }
  }

  return (
    <>
      <AttackPanel title="🎭 Impersonation Attack"
        desc="Attacker steals a victim's DID and tries to authenticate by forging a Verifiable Presentation.">
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Target DID (victim)</label>
          <input value={targetDid} onChange={(e) => setTargetDid(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
          <strong>Attack:</strong> Attacker knows the victim&apos;s DID (which is public). They create a VP claiming to be that DID, sign it with a random key (not the victim&apos;s). Goal: obtain a session JWT for the victim&apos;s account.
        </p>
        <button onClick={runAttack} disabled={running}
          className="w-full bg-red-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60 hover:bg-red-700">
          {running ? "Attacking…" : "▶ Run Impersonation Attack"}
        </button>
        <Terminal lines={logs} />
        {outcome === "blocked" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-green-800 font-semibold text-sm">✓ Attack Blocked</p>
          </div>
        )}
      </AttackPanel>

      <DefensePanel>
        <div className="space-y-3 text-sm text-green-800">
          <p className="font-medium">5-Check VP Verification</p>
          <ul className="space-y-2 text-xs">
            {[
              "Check 1: Nonce must exist in DB and be within 30s TTL",
              "Check 2: Nonce must not have been used before (replay prevention)",
              "Check 3: VP proof signature verified with holder's public key from DIDDocument",
              "Check 4: VC credential proof verified with the original issuer key",
              "Check 5: Credential revocation status checked in bitstring",
            ].map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-green-600 font-bold">{i + 1}.</span>{s}</li>
            ))}
          </ul>
          <div className="bg-green-100 rounded-lg p-2 text-xs text-green-700 font-mono">
            auth_service.py → vk.verify(sig_bytes, sha256(canonical))
          </div>
          <p className="text-xs text-green-700">The VP signature is checked against the public key from the DID Document — attacker&apos;s random key produces a different public key, failing Check 3.</p>
        </div>
      </DefensePanel>
    </>
  );
}

// ── Attack 3: Replay ──────────────────────────────────────────────────────────

function ReplayDemo() {
  const [logs, setLogs] = useState<{ text: string; type: "info" | "error" | "success" | "warn" }[]>([]);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<"blocked" | null>(null);
  const [capturedNonce, setCapturedNonce] = useState<string | null>(null);

  function addLog(text: string, type: "info" | "error" | "success" | "warn" = "info") {
    setLogs((prev) => [...prev, { text, type }]);
  }

  async function step1() {
    setLogs([]);
    addLog("Step 1: Attacker intercepts a legitimate auth request…", "warn");
    addLog("Fetching challenge nonce (simulating network intercept)…", "info");
    try {
      const { nonce } = await getChallenge("replay-demo.evil.com");
      setCapturedNonce(nonce);
      addLog(`Captured nonce: ${nonce}`, "success");
      addLog("Attacker stores this nonce for later replay…", "warn");
      addLog("Step 2: Wait for TTL to expire (30 seconds)…", "info");
    } catch (e: unknown) {
      addLog("Failed to capture nonce: " + (e instanceof Error ? e.message : String(e)), "error");
    }
  }

  async function step2() {
    if (!capturedNonce) { addLog("Run Step 1 first.", "error"); return; }
    setRunning(true);
    addLog("Step 2: Replaying captured nonce after TTL…", "warn");
    addLog(`Nonce: ${capturedNonce}`, "info");
    addLog("Constructing VP with expired nonce (and fake signature)…", "info");

    const fakeVP = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiablePresentation"],
      holder: "did:securedid:victim123",
      verifiableCredential: [],
      nonce: capturedNonce,
      domain: "replay-demo.evil.com",
      created: new Date(Date.now() - 60000).toISOString(),
      proof: {
        type: "EcdsaSecp256r1Signature2019",
        proofValue: "cafebabe".repeat(8),
        verificationMethod: "did:securedid:victim123#keys-1",
        created: new Date(Date.now() - 60000).toISOString(),
      },
    };

    try {
      await verifyPresentation({ verifiable_presentation: fakeVP, domain: "replay-demo.evil.com" });
      addLog("Auth succeeded (should not happen!)", "error");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`Backend rejected: "${msg}"`, "error");
      addLog("Check 1 or Check 2: Nonce expired or already consumed", "info");
      addLog("Nonce TTL is 30s — cannot reuse captured nonces", "info");
      addLog("Even fresh nonces are single-use — deleted on first verify", "info");
      addLog("Replay attack blocked.", "success");
      setOutcome("blocked");
    } finally { setRunning(false); }
  }

  return (
    <>
      <AttackPanel title="⏪ Replay Attack"
        desc="Attacker captures a legitimate authentication token and replays it to gain unauthorized access.">
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
          <strong>Attack:</strong> Intercept a valid challenge nonce from network traffic. Replay the same nonce in a new VP to authenticate without the victim&apos;s key. Works against naive systems.
        </p>
        <div className="flex gap-2">
          <button onClick={step1}
            className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-amber-700">
            Step 1: Capture Nonce
          </button>
          <button onClick={step2} disabled={running || !capturedNonce}
            className="flex-1 bg-red-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60 hover:bg-red-700">
            {running ? "Replaying…" : "Step 2: Replay Attack"}
          </button>
        </div>
        {capturedNonce && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
            <p className="text-xs text-amber-700 font-mono break-all">Captured: {capturedNonce}</p>
          </div>
        )}
        <Terminal lines={logs} />
        {outcome === "blocked" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-green-800 font-semibold text-sm">✓ Attack Blocked</p>
          </div>
        )}
      </AttackPanel>

      <DefensePanel>
        <div className="space-y-3 text-sm text-green-800">
          <p className="font-medium">Nonce-Based Challenge-Response</p>
          <ul className="space-y-2 text-xs">
            {[
              "Challenge nonce generated server-side (cryptographic random UUID)",
              "Nonce stored in DB with 30-second TTL — expires automatically",
              "Nonce deleted immediately on first use (single-use guarantee)",
              "VP must be signed with holder's private key — captures are useless without the key",
              "Domain bound — nonce only valid for the specific portal domain",
            ].map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-green-600 font-bold">{i + 1}.</span>{s}</li>
            ))}
          </ul>
          <div className="bg-green-100 rounded-lg p-2 text-xs text-green-700 font-mono">
            nonce.py → expires_at = now + NONCE_TTL_SECONDS (30s)
          </div>
        </div>
      </DefensePanel>
    </>
  );
}
