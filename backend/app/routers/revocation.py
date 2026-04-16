"""
Revocation + Access Grant router (Module 7).

Type 1 — College revokes a student:
  POST /api/revocation/revoke-student   (panelist JWT; 2-of-5 confirmation)
  GET  /api/revocation/status/{cred_id}

Type 2 — Student manages third-party access grants:
  POST /api/access/grant                (student provides their DID + portal info)
  POST /api/access/revoke/{grant_id}
  GET  /api/access/active/{did}
"""
import time
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_panelist
from app.models.access_grant import AccessGrant
from app.models.credential import Credential
from app.models.did_document import DIDDocument
from app.models.metrics import Metric
from app.models.panelist import Panelist
from app.models.revocation import RevocationRegistry
from app.schemas.revocation import (
    AccessGrantOut,
    AccessGrantRequest,
    RevocationStatusOut,
    RevokeStudentRequest,
)

router = APIRouter()

# 2 panelists must approve before a student credential is revoked
REVOCATION_THRESHOLD = 2


# ── Type 1: College revokes student ──────────────────────────────────────────

@router.post(
    "/revocation/revoke-student",
    response_model=RevocationStatusOut,
    summary="[M7-T1] Panelist votes to revoke a student credential (needs 2 of 5)",
)
async def revoke_student(
    body: RevokeStudentRequest,
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """
    Each panelist call records their vote to revoke a credential.
    When REVOCATION_THRESHOLD votes are collected (default 2), the credential is:
      - Marked is_revoked=True in the credentials table
      - The corresponding bit in the RevocationRegistry bitstring is flipped to 1
    Student's next auth attempt fails at Check 5.
    """
    # Load the credential
    cred_result = await db.execute(
        select(Credential).where(Credential.credential_id == body.credential_id)
    )
    cred = cred_result.scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found.")
    if cred.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Credential is already revoked."
        )

    panelist_id_str = str(current.panelist_id)
    approvers = list(cred.revocation_approvers or [])

    if panelist_id_str in approvers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already voted to revoke this credential.",
        )

    approvers.append(panelist_id_str)
    cred.revocation_approvers = approvers

    if len(approvers) >= REVOCATION_THRESHOLD:
        _rev_start = time.perf_counter()
        # Execute revocation
        cred.is_revoked = True
        cred.revoked_at = datetime.now(timezone.utc)
        cred.revocation_reason = body.reason

        # Flip bit in revocation bitstring
        registry_result = await db.execute(select(RevocationRegistry))
        registry = registry_result.scalars().first()
        if registry:
            registry.bitstring = _flip_bit(registry.bitstring, cred.revocation_index)
            registry.last_updated = datetime.now(timezone.utc)

        db.add(Metric(
            operation="revocation",
            duration_ms=round((time.perf_counter() - _rev_start) * 1000, 3),
            result="SUCCESS",
            meta={"credential_id": str(body.credential_id), "reason": body.reason},
        ))

    await db.flush()
    return RevocationStatusOut(
        credential_id=cred.credential_id,
        is_revoked=cred.is_revoked,
        revocation_index=cred.revocation_index,
    )


@router.get(
    "/revocation/status/{credential_id}",
    response_model=RevocationStatusOut,
    summary="[M7-T1] Check revocation status of a credential",
)
async def get_revocation_status(
    credential_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    cred_result = await db.execute(
        select(Credential).where(Credential.credential_id == credential_id)
    )
    cred = cred_result.scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found.")
    return RevocationStatusOut(
        credential_id=cred.credential_id,
        is_revoked=cred.is_revoked,
        revocation_index=cred.revocation_index,
    )


# ── Type 2: Student access grants ────────────────────────────────────────────

@router.post(
    "/access/grant",
    response_model=AccessGrantOut,
    status_code=status.HTTP_201_CREATED,
    summary="[M7-T2] Student grants a third-party platform access to verify credentials",
)
async def create_access_grant(
    body: AccessGrantRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Student creates an access grant for a portal.
    Optionally sets a TTL (ttl_minutes). No TTL = permanent until manually revoked.
    """
    # Verify the student's DID exists
    did_result = await db.execute(
        select(DIDDocument).where(
            DIDDocument.did == body.student_did,
            DIDDocument.is_active == True,  # noqa: E712
        )
    )
    if did_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DID '{body.student_did}' not found.",
        )

    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(minutes=body.ttl_minutes)) if body.ttl_minutes else None

    grant = AccessGrant(
        student_did=body.student_did,
        platform_name=body.platform_name,
        platform_domain=body.platform_domain,
        granted_at=now,
        expires_at=expires_at,
        is_revoked=False,
    )
    db.add(grant)
    await db.flush()
    return grant


@router.post(
    "/access/revoke/{grant_id}",
    response_model=AccessGrantOut,
    summary="[M7-T2] Student revokes a third-party access grant",
)
async def revoke_access_grant(
    grant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Immediately invalidates the access grant."""
    result = await db.execute(select(AccessGrant).where(AccessGrant.grant_id == grant_id))
    grant = result.scalar_one_or_none()
    if grant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access grant not found.")
    if grant.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Grant is already revoked."
        )

    grant.is_revoked = True
    grant.revoked_at = datetime.now(timezone.utc)
    await db.flush()
    return grant


@router.get(
    "/access/active/{did}",
    response_model=list[AccessGrantOut],
    summary="[M7-T2] List active (non-revoked, non-expired) access grants for a DID",
)
async def list_active_grants(
    did: str,
    db: AsyncSession = Depends(get_db),
):
    """Returns all access grants for a student DID that are still active."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.student_did == did,
            AccessGrant.is_revoked == False,  # noqa: E712
        )
    )
    grants = result.scalars().all()
    # Filter out expired grants in Python (SQLAlchemy can't easily compare with NULL)
    active = [g for g in grants if g.expires_at is None or g.expires_at > now]
    return active


# ── Helpers ───────────────────────────────────────────────────────────────────

def _flip_bit(bitstring: str, index: int) -> str:
    """Set bit at *index* to 1 in the hex bitstring (mark as revoked)."""
    bs = list(bitstring)
    hex_pos = index // 4
    bit_pos = 3 - (index % 4)   # MSB first
    nibble = int(bs[hex_pos], 16)
    nibble |= (1 << bit_pos)    # set bit to 1
    bs[hex_pos] = format(nibble, "x")
    return "".join(bs)
