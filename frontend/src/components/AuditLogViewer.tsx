"use client";
import { AuditLog } from "@/lib/api";

interface Props {
  logs: AuditLog[];
  loading?: boolean;
  title?: string;
  compact?: boolean;
}

export default function AuditLogViewer({ logs, loading, title = "Audit Log", compact }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-800 px-4 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500" />
        <span className="w-3 h-3 rounded-full bg-yellow-500" />
        <span className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-gray-300 text-sm font-mono">{title}</span>
        {loading && <span className="ml-auto text-xs text-gray-400 animate-pulse">live</span>}
      </div>
      <div className="bg-gray-900 font-mono text-xs p-3 max-h-64 overflow-y-auto space-y-1">
        {logs.length === 0 && (
          <p className="text-gray-500 italic">No entries yet…</p>
        )}
        {logs.map((log) => (
          <div
            key={log.log_id}
            className={`flex gap-2 ${log.result === "SUCCESS" ? "text-green-400" : "text-red-400"}`}
          >
            <span className="text-gray-500 shrink-0">
              {new Date(log.attempted_at).toLocaleTimeString()}
            </span>
            <span>{log.result === "SUCCESS" ? "✓" : "✗"}</span>
            {!compact && (
              <>
                <span className="text-gray-300">{log.portal}</span>
                {log.failure_check && (
                  <span className="text-yellow-400">Check {log.failure_check} failed</span>
                )}
                {log.is_anomaly && (
                  <span className="text-orange-400 font-bold">⚠ ANOMALY</span>
                )}
              </>
            )}
            {log.did_attempted && (
              <span className="text-gray-500 truncate">{log.did_attempted.slice(-16)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
