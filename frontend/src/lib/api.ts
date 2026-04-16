/**
 * API client — thin wrapper around fetch targeting the FastAPI backend.
 * All calls include the stored panelist or student JWT if present.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const storedToken = token ?? (typeof window !== "undefined" ? localStorage.getItem("panelist_token") ?? localStorage.getItem("student_token") ?? "" : "");
  if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  // Some endpoints return non-JSON (PDF, etc.)
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return res as unknown as T;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const getChallenge = (domain: string) =>
  req<{ nonce: string; domain: string; expires_in_seconds: number }>(
    "GET", `/auth/challenge?domain=${encodeURIComponent(domain)}`
  );

export const verifyPresentation = (body: { verifiable_presentation: object; domain: string }) =>
  req<{ access_token: string; did: string; holder_name: string; is_suspicious: boolean }>(
    "POST", "/auth/verify", body
  );

export const getSessions = (did: string) =>
  req<{ log_id: string; portal: string; result: string; failure_check: number | null; ip_address: string; is_suspicious: boolean; attempted_at: string }[]>(
    "GET", `/auth/sessions/${encodeURIComponent(did)}`
  );

// ── Admin ────────────────────────────────────────────────────────────────────
export const panelistLogin = (email: string, password: string) =>
  req<{ access_token: string; panelist: { panelist_id: string; name: string; email: string; department: string; eth_address?: string | null } }>(
    "POST", "/admin/login", { email, password }
  );

export const uploadCSV = (file: File, token: string) => {
  const fd = new FormData();
  fd.append("file", file);
  return fetch(`${API_BASE}/admin/upload-csv`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  }).then((r) => r.json());
};

export const getPending = (token: string) =>
  req<Registration[]>("GET", "/admin/pending", undefined, token);

export const approvePending = (id: string, keyShare: string, token: string) =>
  req<ApproveResponse>("POST", `/admin/approve/${id}`, { key_share: keyShare }, token);

export const rejectPending = (id: string, reason: string, token: string) =>
  req<Registration>("POST", `/admin/reject/${id}`, { reason }, token);

export const approveBatch = (keyShare: string, token: string) =>
  req<{ pending_total: number; votes_added: number; newly_approved: number }>(
    "POST", "/admin/approve-batch", { key_share: keyShare }, token
  );

export const getMyShare = (token: string) =>
  req<{ panelist: string; email: string; key_share: string }>(
    "GET", "/admin/my-share", undefined, token
  );

export const getPanelists = (token: string) =>
  req<Panelist[]>("GET", "/admin/panelists", undefined, token);

export const getPendingUpdates = (token: string) =>
  req<DataUpdateRequest[]>("GET", "/admin/pending-updates", undefined, token);

export const approveUpdate = (id: string, keyShare: string, token: string) =>
  req<DataUpdateRequest>("POST", `/admin/approve-update/${id}`, { key_share: keyShare }, token);

// ── DID & Credentials ────────────────────────────────────────────────────────
export const resolveDID = (did: string) =>
  req<{ did: string; did_document: object; blockchain_hash: string | null }>(
    "GET", `/did/${encodeURIComponent(did)}`
  );

export const getCredentials = (did: string) =>
  req<Credential[]>("GET", `/credentials/${encodeURIComponent(did)}`);

export const getCardUrl = (did: string) =>
  `${API_BASE}/credentials/${encodeURIComponent(did)}/card`;

export const getExportUrl = (did: string) =>
  `${API_BASE}/credentials/${encodeURIComponent(did)}/export`;

// ── Registration ─────────────────────────────────────────────────────────────
export const register = (body: {
  email: string; roll_number: string; full_name: string;
  department: string; year: number; secret_key: string;
}) => req<{ request_id: string; status: string }>("POST", "/register", body);

// ── Revocation & Access ──────────────────────────────────────────────────────
export const revokeStudent = (credentialId: string, reason: string, token: string) =>
  req<{ credential_id: string; is_revoked: boolean }>(
    "POST", "/revocation/revoke-student", { credential_id: credentialId, reason }, token
  );

export const createAccessGrant = (body: {
  student_did: string; platform_name: string; platform_domain: string; ttl_minutes?: number;
}) => req<AccessGrant>("POST", "/access/grant", body);

export const revokeGrant = (grantId: string) =>
  req<AccessGrant>("POST", `/access/revoke/${grantId}`);

export const getActiveGrants = (did: string) =>
  req<AccessGrant[]>("GET", `/access/active/${encodeURIComponent(did)}`);

// ── Governance ───────────────────────────────────────────────────────────────
export const createProposal = (body: {
  proposal_type: string; reason?: string;
  target_panelist_id?: string;
  new_panelist_name?: string; new_panelist_email?: string; new_panelist_department?: string;
}, token: string) => req<Proposal>("POST", "/governance/propose", body, token);

export const voteProposal = (proposalId: string, vote: boolean, token: string) =>
  req<Proposal>("POST", `/governance/vote/${proposalId}`, { vote }, token);

export const getProposals = (token: string) =>
  req<Proposal[]>("GET", "/governance/proposals", undefined, token);

// ── Data Updates ─────────────────────────────────────────────────────────────
export const submitUpdateRequest = (body: {
  student_did: string; field_name: string; old_value: string; new_value: string; requires_vc_reissue: boolean;
}) => req<DataUpdateRequest>("POST", "/student/update-request", body);

// ── Metrics ──────────────────────────────────────────────────────────────────
export const getDashboard = (token: string) =>
  req<DashboardData>("GET", "/metrics/dashboard", undefined, token);

export const getAuditLogs = (token: string, did?: string, result?: string) => {
  const params = new URLSearchParams();
  if (did) params.set("did", did);
  if (result) params.set("result", result);
  return req<AuditLog[]>("GET", `/audit/logs?${params}`, undefined, token);
};

export const exportMetrics = (token: string) =>
  req<MetricRow[]>("GET", "/metrics/export", undefined, token);

// ── Wallet auth (panelist MetaMask) ───────────────────────────────────────────
export const walletChallenge = (eth_address: string) =>
  req<{ challenge: string }>("POST", "/admin/wallet-challenge", { eth_address });

export const walletVerify = (eth_address: string, signature: string) =>
  req<{ access_token: string; panelist: Panelist }>("POST", "/admin/wallet-verify", { eth_address, signature });

export const linkWallet = (eth_address: string, token: string) =>
  req<Panelist>("POST", "/admin/link-wallet", { eth_address }, token);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Registration {
  request_id: string; email: string; roll_number: string; full_name: string;
  department: string; year: number; status: string; approvals_count: number;
  csv_match: boolean; created_at: string;
}

export interface ApproveResponse {
  registration: Registration;
  student_did?: string;
  vc_json?: object;
  student_private_key_b64?: string;
  blockchain_hash?: string | null;
}

export interface Credential {
  credential_id: string; holder_did: string; vc_json: Record<string, unknown>;
  revocation_index: number; is_revoked: boolean; issued_at: string; expires_at: string;
}

export interface Panelist {
  eth_address?: string | null;
  panelist_id: string; name: string; email: string; department: string; is_active: boolean;
}

export interface Proposal {
  proposal_id: string; proposal_type: string; target_panelist_id?: string;
  new_panelist_name?: string; new_panelist_email?: string; new_panelist_department?: string;
  proposed_by: string; reason?: string; votes_yes: number; votes_no: number;
  status: string; created_at: string; expires_at: string; resolved_at?: string;
}

export interface DataUpdateRequest {
  update_id: string; student_did: string; field_name: string;
  old_value: string; new_value: string; requires_vc_reissue: boolean;
  approvals_count: number; status: string; created_at: string;
}

export interface AccessGrant {
  grant_id: string; student_did: string; platform_name: string; platform_domain: string;
  granted_at: string; expires_at?: string; is_revoked: boolean;
}

export interface DashboardData {
  operation_stats: { operation: string; count: number; avg_ms: number; min_ms: number; max_ms: number }[];
  auth_summary: Record<string, number>;
  failure_by_check: Record<string, number>;
  system_counts: { total_registrations: number; approved_registrations: number; total_credentials: number; revoked_credentials: number };
}

export interface AuditLog {
  log_id: string; did_attempted?: string; portal: string; result: string;
  failure_check?: number; ip_address?: string; is_anomaly: boolean; attempted_at: string;
}

export interface MetricRow {
  metric_id: string; operation: string; duration_ms: number; result: string;
  metadata?: Record<string, unknown>; recorded_at: string;
}
