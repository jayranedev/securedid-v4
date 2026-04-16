"""
Metrics, analytics, and audit log router (M11).

GET /api/metrics/export    — raw metrics dump (all operations, filterable)
GET /api/metrics/dashboard — aggregated stats for 10 dashboard charts
GET /api/audit/logs        — auth audit log (filterable by DID / result)
"""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_panelist
from app.models.audit_log import AuthAuditLog
from app.models.credential import Credential
from app.models.metrics import Metric
from app.models.panelist import Panelist
from app.models.registration import RegistrationRequest

router = APIRouter()


# ── M11: Metrics ──────────────────────────────────────────────────────────────

@router.get(
    "/metrics/export",
    summary="[M11] Export raw operation metrics (panelist auth required)",
)
async def export_metrics(
    operation: str | None = Query(None, description="Filter by operation name"),
    result: str | None = Query(None, description="Filter by SUCCESS or FAILURE"),
    limit: int = Query(500, le=5000),
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """Returns raw metrics rows, optionally filtered by operation and result."""
    q = select(Metric).order_by(Metric.recorded_at.desc()).limit(limit)
    if operation:
        q = q.where(Metric.operation == operation)
    if result:
        q = q.where(Metric.result == result.upper())

    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "metric_id": str(r.metric_id),
            "operation": r.operation,
            "duration_ms": r.duration_ms,
            "result": r.result,
            "metadata": r.meta,
            "recorded_at": r.recorded_at.isoformat(),
        }
        for r in rows
    ]


@router.get(
    "/metrics/dashboard",
    summary="[M11] Aggregated metrics for dashboard charts",
)
async def dashboard_metrics(
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """Returns aggregated stats for all 10 dashboard charts."""

    # Per-operation avg/min/max/count
    op_stats_q = select(
        Metric.operation,
        func.count(Metric.metric_id).label("count"),
        func.avg(Metric.duration_ms).label("avg_ms"),
        func.min(Metric.duration_ms).label("min_ms"),
        func.max(Metric.duration_ms).label("max_ms"),
    ).group_by(Metric.operation)
    op_rows = (await db.execute(op_stats_q)).fetchall()

    # Auth audit summary
    audit_q = select(
        AuthAuditLog.result,
        func.count(AuthAuditLog.log_id).label("count"),
    ).group_by(AuthAuditLog.result)
    audit_rows = (await db.execute(audit_q)).fetchall()

    # Failure breakdown by check number
    check_q = select(
        AuthAuditLog.failure_check,
        func.count(AuthAuditLog.log_id).label("count"),
    ).where(
        AuthAuditLog.result == "FAILURE",
        AuthAuditLog.failure_check.isnot(None),
    ).group_by(AuthAuditLog.failure_check)
    check_rows = (await db.execute(check_q)).fetchall()

    # System counts
    total_registrations = (await db.execute(select(func.count(RegistrationRequest.request_id)))).scalar_one()
    approved_count = (await db.execute(
        select(func.count(RegistrationRequest.request_id))
        .where(RegistrationRequest.status == "approved")
    )).scalar_one()
    revoked_count = (await db.execute(
        select(func.count(Credential.credential_id))
        .where(Credential.is_revoked == True)  # noqa: E712
    )).scalar_one()
    total_credentials = (await db.execute(select(func.count(Credential.credential_id)))).scalar_one()

    return {
        "operation_stats": [
            {
                "operation": r.operation,
                "count": r.count,
                "avg_ms": round(r.avg_ms or 0, 2),
                "min_ms": round(r.min_ms or 0, 2),
                "max_ms": round(r.max_ms or 0, 2),
            }
            for r in op_rows
        ],
        "auth_summary": {r.result: r.count for r in audit_rows},
        "failure_by_check": {f"check_{r.failure_check}": r.count for r in check_rows if r.failure_check},
        "system_counts": {
            "total_registrations": total_registrations,
            "approved_registrations": approved_count,
            "total_credentials": total_credentials,
            "revoked_credentials": revoked_count,
        },
    }


# ── M11: Audit log ────────────────────────────────────────────────────────────

@router.get(
    "/audit/logs",
    summary="[M11] Auth audit log (panelist auth required)",
)
async def get_audit_logs(
    did: str | None = Query(None, description="Filter by student DID"),
    result: str | None = Query(None, description="Filter by SUCCESS or FAILURE"),
    limit: int = Query(100, le=1000),
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """Returns authentication audit log entries, newest first."""
    q = select(AuthAuditLog).order_by(AuthAuditLog.attempted_at.desc()).limit(limit)
    if did:
        q = q.where(AuthAuditLog.did_attempted == did)
    if result:
        q = q.where(AuthAuditLog.result == result.upper())

    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "log_id": str(r.log_id),
            "did_attempted": r.did_attempted,
            "portal": r.portal,
            "result": r.result,
            "failure_check": r.failure_check,
            "ip_address": r.ip_address,
            "is_anomaly": r.is_anomaly,
            "attempted_at": r.attempted_at.isoformat(),
        }
        for r in rows
    ]
