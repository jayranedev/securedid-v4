"""
Challenge-response authentication service.

Two steps:
  1. challenge(domain) → nonce (32 hex chars, 30-second TTL)
  2. verify(vp, domain) → JWT on success

5-check VP verification pipeline:
  Check 1 — Nonce exists and has not expired
  Check 2 — Nonce has not been used before (replay prevention)
  Check 3 — VP signature verifies against student's DID Document public key
  Check 4 — VC signature verifies against institution's master public key
  Check 5 — Credential revocation bitstring bit = 0 (not revoked)
"""
import base64
import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

from ecdsa import BadSignatureError, VerifyingKey, NIST256p
from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.audit_log import AuthAuditLog
from app.models.credential import Credential
from app.models.did_document import DIDDocument
from app.models.institution_key import InstitutionKey
from app.models.nonce import Nonce
from app.models.revocation import RevocationRegistry
from app.utils.jwt_utils import create_access_token

logger = logging.getLogger(__name__)

# Generic message sent to clients on every failure — never reveals which check failed
_AUTH_FAIL_MSG = "Authentication failed. Please try again."


# ── Nonce generation ──────────────────────────────────────────────────────────

async def generate_challenge(db: AsyncSession, domain: str) -> Nonce:
    """Create and store a 32-hex-char nonce with a 30-second TTL."""
    nonce_value = secrets.token_hex(16)   # 32 hex chars
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.NONCE_TTL_SECONDS)

    nonce_record = Nonce(
        nonce=nonce_value,
        domain=domain,
        created_at=now,
        expires_at=expires_at,
        is_used=False,
    )
    db.add(nonce_record)
    await db.flush()
    return nonce_record


# ── VP verification ───────────────────────────────────────────────────────────

async def verify_presentation(
    db: AsyncSession,
    vp: dict,
    expected_domain: str,
    request: Request | None = None,
) -> AuthAuditLog:
    """
    Run the 5-check pipeline. On any failure, log the check number and raise HTTP 401.
    On success, mark the nonce as used, issue a JWT, and log the success.

    Returns the AuthAuditLog record (caller should commit after).
    """
    ip = _get_ip(request)
    holder_did = vp.get("holder")
    nonce_value = vp.get("nonce")
    portal = expected_domain or "unknown"

    async def _fail(check: int, internal_reason: str) -> None:
        """Log failure and raise HTTP 401 with generic message."""
        logger.warning(
            "Auth FAILURE check=%d did=%s portal=%s reason=%s",
            check, holder_did, portal, internal_reason,
        )
        await _log(db, holder_did, portal, nonce_value, "FAILURE", check, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_AUTH_FAIL_MSG,
        )

    # ── Check 1: Nonce exists and has not expired ─────────────────────────────
    nonce_rec = await db.get(Nonce, nonce_value)
    if nonce_rec is None:
        await _fail(1, "nonce not found")
    if datetime.now(timezone.utc) > nonce_rec.expires_at:
        await _fail(1, f"nonce expired at {nonce_rec.expires_at}")

    # ── Check 2: Nonce not used before (replay prevention) ───────────────────
    if nonce_rec.is_used:
        await _fail(2, f"nonce already used by {nonce_rec.used_by_did}")

    # ── Check 3: VP signature verifies against student's public key ───────────
    did_doc_result = await db.execute(
        select(DIDDocument).where(
            DIDDocument.did == holder_did,
            DIDDocument.is_active == True,  # noqa: E712
        )
    )
    did_doc_record = did_doc_result.scalar_one_or_none()
    if did_doc_record is None:
        await _fail(3, f"DID document not found: {holder_did}")

    try:
        pubkey_b64 = did_doc_record.did_document["authentication"][0]["publicKeyBase64"]
        pubkey_bytes = base64.b64decode(pubkey_b64)
        vk = VerifyingKey.from_string(pubkey_bytes, curve=NIST256p)

        vp_body = {k: v for k, v in vp.items() if k != "proof"}
        canonical = json.dumps(vp_body, sort_keys=True, separators=(",", ":"))
        data_hash = hashlib.sha256(canonical.encode()).digest()

        sig_hex = vp.get("proof", {}).get("proofValue", "")
        sig_bytes = bytes.fromhex(sig_hex)
        vk.verify(sig_bytes, data_hash)
    except (BadSignatureError, Exception) as exc:
        await _fail(3, f"VP signature invalid: {exc}")

    # ── Check 4: VC signature verifies against institution's public key ───────
    vcs = vp.get("verifiableCredential", [])
    if not vcs:
        await _fail(4, "no verifiableCredential in VP")

    vc = vcs[0]
    institution_key_result = await db.execute(select(InstitutionKey))
    institution_key = institution_key_result.scalars().first()
    if institution_key is None:
        await _fail(4, "institution key not configured")

    try:
        from app.services.shamir_service import verify_signature as verify_vc_sig
        vc_body = {k: v for k, v in vc.items() if k != "proof"}
        canonical_vc = json.dumps(vc_body, sort_keys=True, separators=(",", ":"))
        vc_hash = hashlib.sha256(canonical_vc.encode()).digest()
        vc_sig_hex = vc.get("proof", {}).get("proofValue", "")
        if not verify_vc_sig(institution_key.public_key_pem, vc_hash, vc_sig_hex):
            await _fail(4, "VC signature verification returned False")
    except Exception as exc:
        await _fail(4, f"VC signature invalid: {exc}")

    # ── Check 4b: Credential not expired ─────────────────────────────────────
    expiration_str = vc.get("expirationDate")
    if expiration_str:
        try:
            exp_dt = datetime.fromisoformat(expiration_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                await _fail(4, f"VC expired at {expiration_str}")
        except ValueError:
            pass  # malformed date — don't fail, log internally

    # ── Check 5: Credential not revoked ──────────────────────────────────────
    rev_index = vc.get("credentialStatus", {}).get("statusListIndex")
    if rev_index is None:
        await _fail(5, "no credentialStatus.statusListIndex in VC")

    registry_result = await db.execute(select(RevocationRegistry))
    registry = registry_result.scalars().first()
    if registry and _is_revoked(registry.bitstring, rev_index):
        await _fail(5, f"credential at index {rev_index} is revoked")

    # ── All checks passed ─────────────────────────────────────────────────────
    # Mark nonce used
    nonce_rec.is_used = True
    nonce_rec.used_by_did = holder_did

    # Issue JWT for student
    holder_name = vc.get("credentialSubject", {}).get("name", "")
    access_token = create_access_token(
        subject=holder_did,
        extra={"type": "student", "name": holder_name, "portal": portal},
    )

    audit = await _log(db, holder_did, portal, nonce_value, "SUCCESS", None, ip)

    # ── M12 Anomaly Detection: same DID from different IP within window ───────
    if ip and holder_did:
        window_start = datetime.now(timezone.utc) - timedelta(seconds=settings.ANOMALY_WINDOW_SECONDS)
        anomaly_check = await db.execute(
            select(AuthAuditLog).where(
                AuthAuditLog.did_attempted == holder_did,
                AuthAuditLog.result == "SUCCESS",
                AuthAuditLog.attempted_at >= window_start,
                AuthAuditLog.ip_address != ip,
                AuthAuditLog.ip_address.isnot(None),
            ).limit(1)
        )
        if anomaly_check.scalar_one_or_none() is not None:
            audit.is_anomaly = True
            logger.warning(
                "ANOMALY detected: DID %s authenticated from new IP %s within %ds window",
                holder_did, ip, settings.ANOMALY_WINDOW_SECONDS,
            )

    await db.flush()

    return access_token, holder_name, audit


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_revoked(bitstring: str, index: int) -> bool:
    """Return True if the bit at *index* in the hex bitstring is 1."""
    try:
        hex_pos = index // 4
        bit_pos = 3 - (index % 4)   # MSB first
        nibble = int(bitstring[hex_pos], 16)
        return bool((nibble >> bit_pos) & 1)
    except (IndexError, ValueError):
        return False


def _get_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def _log(
    db: AsyncSession,
    did: str | None,
    portal: str,
    nonce: str | None,
    result: str,
    failure_check: int | None,
    ip: str | None,
) -> AuthAuditLog:
    entry = AuthAuditLog(
        did_attempted=did,
        portal=portal,
        nonce_used=nonce,
        result=result,
        failure_check=failure_check,
        failure_reason=_AUTH_FAIL_MSG if result == "FAILURE" else None,
        ip_address=ip,
    )
    db.add(entry)
    return entry
