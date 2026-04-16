"""
Challenge-response authentication router.

GET  /api/auth/challenge?domain=X  — request a nonce (30s TTL)
POST /api/auth/verify               — verify VP, issue JWT
GET  /api/auth/sessions/{did}       — session history for a DID (M12)
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit_log import AuthAuditLog
from app.schemas.auth import AuthSuccessResponse, ChallengeResponse, VPVerifyRequest
from app.services import auth_service, metrics_service

router = APIRouter()


@router.get(
    "/challenge",
    response_model=ChallengeResponse,
    summary="Request a challenge nonce for VP signing",
)
async def get_challenge(
    domain: str = Query(..., description="Requesting portal's domain"),
    db: AsyncSession = Depends(get_db),
):
    """
    Issues a 32-hex-char nonce with a 30-second TTL.
    The student's wallet embeds this nonce in the VP before signing.
    """
    nonce_record = await metrics_service.record(
        db,
        "challenge_gen",
        auth_service.generate_challenge(db, domain),
        domain=domain,
    )
    return ChallengeResponse(
        nonce=nonce_record.nonce,
        domain=domain,
        expires_in_seconds=30,
    )


@router.post(
    "/verify",
    response_model=AuthSuccessResponse,
    summary="Verify a signed Verifiable Presentation — issues JWT on success",
)
async def verify_presentation(
    body: VPVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Runs the 5-check verification pipeline:
      1. Nonce valid and not expired
      2. Nonce not used before (replay prevention)
      3. VP signature valid (student's key)
      4. VC signature valid (institution's key)
      5. Credential not revoked

    On any failure, returns HTTP 401 with a generic message (no check number revealed).
    On success, returns a JWT access token.
    """
    access_token, holder_name, audit = await metrics_service.record(
        db,
        "vp_verify",
        auth_service.verify_presentation(
            db, body.verifiable_presentation, body.domain, request
        ),
        did=body.verifiable_presentation.get("holder", ""),
        domain=body.domain,
    )
    holder_did = body.verifiable_presentation.get("holder", "")
    return AuthSuccessResponse(
        access_token=access_token,
        did=holder_did,
        holder_name=holder_name,
        is_suspicious=audit.is_anomaly if audit else False,
    )


@router.get(
    "/sessions/{did}",
    summary="[M12] Session activity history for a DID",
)
async def get_sessions(
    did: str,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all authentication attempts for a given DID, newest first.
    Includes anomaly flags for multi-IP detections (M12).
    """
    result = await db.execute(
        select(AuthAuditLog)
        .where(AuthAuditLog.did_attempted == did)
        .order_by(AuthAuditLog.attempted_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "log_id": str(r.log_id),
            "portal": r.portal,
            "result": r.result,
            "failure_check": r.failure_check,
            "ip_address": r.ip_address,
            "is_suspicious": r.is_anomaly,
            "attempted_at": r.attempted_at.isoformat(),
        }
        for r in rows
    ]
