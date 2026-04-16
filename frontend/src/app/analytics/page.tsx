"use client";
import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { getDashboard, exportMetrics, getAuditLogs, panelistLogin, type DashboardData, type MetricRow, type AuditLog } from "@/lib/api";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

export default function AnalyticsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("panelist_token");
    if (t) setToken(t);
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setLoginLoading(true); setLoginErr("");
    try {
      const res = await panelistLogin(email, password);
      setToken(res.access_token);
      localStorage.setItem("panelist_token", res.access_token);
    } catch (e: unknown) {
      setLoginErr(e instanceof Error ? e.message : "Login failed");
    } finally { setLoginLoading(false); }
  }

  if (!token) return (
    <div className="max-w-sm mx-auto px-4 py-16 space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 text-center">Analytics Login</h1>
      {loginErr && <p className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{loginErr}</p>}
      <form onSubmit={login} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="panelist@dbce.edu" className={inp} />
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password" className={inp} />
        <button type="submit" disabled={loginLoading}
          className="w-full bg-indigo-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-60">
          {loginLoading ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );

  return <Dashboard token={token} onLogout={() => { setToken(null); localStorage.removeItem("panelist_token"); }} />;
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "metrics" | "audit">("overview");

  useEffect(() => {
    setLoading(true);
    Promise.all([getDashboard(token), exportMetrics(token), getAuditLogs(token)])
      .then(([d, m, a]) => { setDashboard(d); setMetrics(m); setAuditLogs(a); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analytics & Benchmarks</h1>
          <p className="text-sm text-slate-500">Live metrics from SecureDID operations</p>
        </div>
        <button onClick={onLogout} className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5">
          Logout
        </button>
      </div>

      <div className="flex gap-1">
        {(["overview", "metrics", "audit"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-400 text-sm">Loading analytics…</p>
        </div>
      ) : (
        <>
          {tab === "overview" && dashboard && <OverviewTab dashboard={dashboard} metrics={metrics} />}
          {tab === "metrics" && <MetricsTab metrics={metrics} />}
          {tab === "audit" && <AuditTab logs={auditLogs} />}
        </>
      )}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ dashboard: d, metrics }: { dashboard: DashboardData; metrics: MetricRow[] }) {
  const { system_counts: sc, auth_summary, failure_by_check, operation_stats } = d;

  const authPieData = Object.entries(auth_summary).map(([name, value]) => ({ name, value }));
  const failPieData = Object.entries(failure_by_check).map(([name, value]) => ({ name: `Check ${name}`, value }));

  // timing chart
  const timingData = operation_stats.map((op) => ({
    name: op.operation.replace(/_/g, " "),
    avg: Math.round(op.avg_ms),
    min: Math.round(op.min_ms),
    max: Math.round(op.max_ms),
    count: op.count,
  }));

  // recent metric timeline (last 50)
  const recent = [...metrics].reverse().slice(0, 50).reverse();
  const timelineData = recent.map((m, i) => ({
    idx: i,
    ms: Math.round(m.duration_ms),
    op: m.operation,
  }));

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Registrations", value: sc.total_registrations, color: "text-indigo-700", bg: "bg-indigo-50" },
          { label: "Approved Students", value: sc.approved_registrations, color: "text-green-700", bg: "bg-green-50" },
          { label: "Active Credentials", value: sc.total_credentials, color: "text-purple-700", bg: "bg-purple-50" },
          { label: "Revoked Credentials", value: sc.revoked_credentials, color: "text-red-700", bg: "bg-red-50" },
        ].map((k) => (
          <div key={k.label} className={`${k.bg} rounded-xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Timing bar chart */}
      {timingData.length > 0 && (
        <ChartCard title="Operation Timing (ms)" subtitle="Average / Min / Max per operation type">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={timingData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v} ms`} />
              <Legend />
              <Bar dataKey="avg" name="Avg (ms)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="min" name="Min (ms)" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
              <Bar dataKey="max" name="Max (ms)" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Auth outcome pie */}
        {authPieData.length > 0 && (
          <ChartCard title="Auth Outcomes" subtitle="Success vs failure breakdown">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={authPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {authPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Failure by check */}
        {failPieData.length > 0 && (
          <ChartCard title="Failures by Check" subtitle="Which verification step is failing most">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={failPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {failPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Timeline */}
      {timelineData.length > 0 && (
        <ChartCard title="Recent Operation Latency" subtitle="Last 50 recorded operations (ms)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timelineData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="idx" tick={false} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v} ms`} labelFormatter={(l) => `Op #${Number(l) + 1}`} />
              <Line type="monotone" dataKey="ms" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {timelineData.length === 0 && timingData.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          No operation metrics recorded yet. Use the platform features to generate data.
        </div>
      )}
    </div>
  );
}

// ── Metrics table ─────────────────────────────────────────────────────────────

function MetricsTab({ metrics }: { metrics: MetricRow[] }) {
  const [filter, setFilter] = useState("");
  const filtered = metrics.filter((m) => !filter || m.operation.includes(filter));

  const byOp = metrics.reduce<Record<string, number[]>>((acc, m) => {
    if (!acc[m.operation]) acc[m.operation] = [];
    acc[m.operation].push(m.duration_ms);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Per-op summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(byOp).map(([op, times]) => {
          const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
          return (
            <div key={op} className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500">{op.replace(/_/g, " ")}</p>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{avg} ms</p>
              <p className="text-xs text-gray-400">{times.length} samples</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by operation…" className={`${inp} max-w-xs`} />
        <p className="text-xs text-gray-400">{filtered.length} records</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Operation</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Duration</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">Result</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.slice(0, 100).map((m) => (
              <tr key={m.metric_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{m.operation}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-slate-700">{Math.round(m.duration_ms)} ms</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${m.result === "SUCCESS" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {m.result}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-xs text-gray-400">{new Date(m.recorded_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">No metrics yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function AuditTab({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{logs.length} auth events</p>
      <div className="bg-gray-900 rounded-xl p-4 space-y-1.5 max-h-[600px] overflow-y-auto">
        {logs.length === 0 && <p className="text-gray-500 text-xs font-mono">No auth events recorded.</p>}
        {logs.map((l) => (
          <div key={l.log_id} className="font-mono text-xs flex gap-3">
            <span className="text-gray-500 shrink-0">{new Date(l.attempted_at).toLocaleTimeString()}</span>
            <span className={l.result === "SUCCESS" ? "text-green-400" : "text-red-400"}>{l.result}</span>
            {l.failure_check !== null && <span className="text-amber-400">Check {l.failure_check}</span>}
            <span className="text-gray-300 truncate">{l.did_attempted?.slice(0, 36) ?? "—"}</span>
            <span className="text-gray-500">{l.portal}</span>
            {l.is_anomaly && <span className="text-orange-400">⚠ ANOMALY</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div>
        <p className="font-semibold text-slate-800 text-sm">{title}</p>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

const inp = "w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
