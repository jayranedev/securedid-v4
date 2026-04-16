"""
Admin router — all endpoints require panelist JWT except /login and /create-panelist.

Endpoints (M2):
  POST /api/admin/create-panelist   — one-time setup, guarded by SUPER_ADMIN_SECRET
  POST /api/admin/login             — panelist login → JWT
  POST /api/admin/upload-csv        — upload student CSV
  GET  /api/admin/pending           — list pending registrations
  GET  /api/admin/panelists         — list all panelists (for governance UI)

Endpoints (M3):
  POST /api/admin/setup-keys        — generate master key + distribute Shamir shares
  GET  /api/admin/my-share          — panelist retrieves their key share (one-time)
  POST /api/admin/approve/{id}      — submit key share to approve a registration
  POST /api/admin/reject/{id}       — reject a registration
  POST /api/admin/approve-batch     — submit key share to approve ALL pending
"""
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Header
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_panelist
from app.models.institution_key import InstitutionKey
from app.models.panelist import Panelist
from app.models.registration import RegistrationRequest
from app.schemas.panelist import (
    PanelistCreate,
    PanelistLogin,
    PanelistOut,
    PanelistTokenResponse,
    SetupKeysResponse,
    WalletChallengeRequest,
    WalletChallengeResponse,
    WalletVerifyRequest,
    WalletLinkRequest,
)

# In-memory nonce store for wallet challenges (TTL 5 min)
# Maps eth_address.lower() → (nonce_str, issued_at_unix)
_wallet_nonces: dict[str, tuple[str, float]] = {}
from app.schemas.registration import (
    ApproveRequest,
    ApproveResponse,
    BatchApproveRequest,
    RejectRequest,
    RegistrationOut,
)
from app.services import csv_service, did_service, metrics_service, shamir_service
from app.utils.hashing import hash_password, verify_password
from app.utils.jwt_utils import create_access_token

router = APIRouter()


# ── Panelist management ──────────────────────────────────────────────────────

@router.post(
    "/create-panelist",
    response_model=PanelistOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a panelist (super-admin only, max 5)",
)
async def create_panelist(
    body: PanelistCreate,
    x_super_admin_secret: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Protected by the X-Super-Admin-Secret header.
    Fails if 5 panelists already exist.
    """
    if x_super_admin_secret != settings.SUPER_ADMIN_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    count_result = await db.execute(select(func.count()).select_from(Panelist))
    count = count_result.scalar_one()
    if count >= 5:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Maximum of 5 panelists already created",
        )

    existing = await db.execute(
        select(Panelist).where(Panelist.email == body.email.lower())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    panelist = Panelist(
        name=body.name,
        email=body.email.lower(),
        department=body.department.upper(),
        password_hash=hash_password(body.password),
    )
    db.add(panelist)
    await db.flush()
    return panelist


@router.post(
    "/login",
    response_model=PanelistTokenResponse,
    summary="Panelist login → JWT",
)
async def panelist_login(
    body: PanelistLogin,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Panelist).where(
            Panelist.email == body.email.lower(),
            Panelist.is_active == True,  # noqa: E712
        )
    )
    panelist = result.scalar_one_or_none()

    # Constant-time: always call verify_password even when user not found
    dummy_hash = "$2b$12$notarealhashjustfortimingatk"
    password_ok = (
        verify_password(body.password, panelist.password_hash)
        if panelist
        else verify_password(body.password, dummy_hash)
    )

    if not panelist or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        subject=str(panelist.panelist_id),
        extra={"name": panelist.name, "dept": panelist.department},
    )
    return PanelistTokenResponse(access_token=token, panelist=panelist)


@router.post(
    "/wallet-challenge",
    response_model=WalletChallengeResponse,
    summary="Request a sign challenge for MetaMask wallet auth",
)
async def wallet_challenge(body: WalletChallengeRequest):
    """
    Returns a unique message for the panelist to sign with their Base Sepolia wallet.
    The signed message is then submitted to /wallet-verify.
    """
    addr = body.eth_address.lower()
    nonce = secrets.token_hex(16)
    _wallet_nonces[addr] = (nonce, time.time())
    challenge = (
        f"SecureDID Admin Login\n"
        f"Address: {addr}\n"
        f"Nonce: {nonce}\n"
        f"This signature proves you control this wallet. It does not trigger a transaction."
    )
    return WalletChallengeResponse(challenge=challenge)


@router.post(
    "/wallet-verify",
    response_model=PanelistTokenResponse,
    summary="Verify MetaMask signature and issue panelist JWT",
)
async def wallet_verify(body: WalletVerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    Verifies the EIP-191 personal_sign signature, matches the address to a panelist,
    and issues a JWT.
    """
    from eth_account import Account
    from eth_account.messages import encode_defunct

    addr = body.eth_address.lower()

    # Check nonce exists and is not expired (5 min)
    nonce_entry = _wallet_nonces.pop(addr, None)
    if not nonce_entry:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No challenge found. Request a challenge first.")
    nonce_str, issued_at = nonce_entry
    if time.time() - issued_at > 300:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Challenge expired. Request a new one.")

    # Reconstruct the challenge message
    expected_message = (
        f"SecureDID Admin Login\n"
        f"Address: {addr}\n"
        f"Nonce: {nonce_str}\n"
        f"This signature proves you control this wallet. It does not trigger a transaction."
    )

    # Recover signer address
    try:
        msg = encode_defunct(text=expected_message)
        recovered = Account.recover_message(msg, signature=body.signature).lower()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature.")

    if recovered != addr:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signature address mismatch.")

    # Look up panelist by eth_address
    result = await db.execute(
        select(Panelist).where(Panelist.eth_address == addr, Panelist.is_active == True)  # noqa: E712
    )
    panelist = result.scalar_one_or_none()
    if not panelist:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No panelist linked to this wallet address. Link your wallet via Settings first.",
        )

    token = create_access_token(
        subject=str(panelist.panelist_id),
        extra={"name": panelist.name, "dept": panelist.department},
    )
    return PanelistTokenResponse(access_token=token, panelist=panelist)


@router.post(
    "/link-wallet",
    response_model=PanelistOut,
    summary="Link a Base Sepolia wallet address to the current panelist account",
)
async def link_wallet(
    body: WalletLinkRequest,
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """
    Associates a Base Sepolia eth_address with this panelist.
    After linking, the panelist can log in via MetaMask wallet signature.
    """
    addr = body.eth_address.lower()
    if not addr.startswith("0x") or len(addr) != 42:
        raise HTTPException(status_code=400, detail="Invalid Ethereum address.")

    # Check not already taken by another panelist
    existing = await db.execute(select(Panelist).where(Panelist.eth_address == addr))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Wallet address already linked to another panelist.")

    current.eth_address = addr
    await db.flush()
    return current


@router.get(
    "/panelists",
    response_model=list[PanelistOut],
    summary="List all panelists",
)
async def list_panelists(
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Panelist).order_by(Panelist.created_at))
    return result.scalars().all()


# ── CSV upload ───────────────────────────────────────────────────────────────

@router.post("/upload-csv", summary="Upload authorized student CSV")
async def upload_csv(
    file: UploadFile = File(
        ...,
        description="CSV: email,roll_number,full_name,dob,department,year,secret_key",
    ),
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv files are accepted",
        )

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 5 MB limit",
        )

    try:
        upload_result = await metrics_service.record(
            db,
            "csv_upload",
            csv_service.process_csv_upload(db, file_bytes, current.panelist_id),
            panelist=str(current.panelist_id),
            filename=file.filename,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    return {
        "message": f"CSV processed: {upload_result.inserted} students added",
        "total_rows": upload_result.total_rows,
        "inserted": upload_result.inserted,
        "skipped_duplicates": upload_result.skipped_duplicates,
        "skipped_conflicts": upload_result.skipped_conflicts,
        "row_errors": upload_result.errors,
    }


# ── Registration queue ───────────────────────────────────────────────────────

@router.get(
    "/pending",
    response_model=list[RegistrationOut],
    summary="List pending registration requests",
)
async def get_pending_registrations(
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RegistrationRequest)
        .where(RegistrationRequest.status == "pending")
        .order_by(RegistrationRequest.created_at)
    )
    return result.scalars().all()


# ── M3: Key setup ─────────────────────────────────────────────────────────────

@router.post(
    "/setup-keys",
    response_model=SetupKeysResponse,
    status_code=status.HTTP_201_CREATED,
    summary="[M3] Generate master key + distribute Shamir shares to all panelists",
)
async def setup_keys(
    x_super_admin_secret: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    One-time operation (idempotent guard: fails if key already set up).

    1. Generates ECDSA P-256 master key pair.
    2. Splits private key into 5 Shamir shares (threshold = 3).
    3. Assigns one share to each panelist (stores SHA-256 hash + hex in DB).
    4. Persists public key in institution_keys table.
    5. Returns all shares — save them, they won't be shown again.
    """
    if x_super_admin_secret != settings.SUPER_ADMIN_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Idempotency guard
    existing_key = await db.execute(select(InstitutionKey))
    if existing_key.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Master key already set up. Use /api/admin/my-share to retrieve shares.",
        )

    # Must have exactly 5 panelists
    panelists_result = await db.execute(select(Panelist).order_by(Panelist.created_at))
    panelists = list(panelists_result.scalars().all())
    if len(panelists) != 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Need exactly 5 panelists before setup, found {len(panelists)}.",
        )

    # Generate master key + split
    private_key_bytes, public_key_pem = shamir_service.generate_master_key()
    shares = shamir_service.split_key(
        private_key_bytes,
        n=settings.SHAMIR_SHARES,
        k=settings.SHAMIR_THRESHOLD,
    )

    # Assign one share to each panelist
    share_map: dict[str, str] = {}
    for panelist, share in zip(panelists, shares):
        share_hex = shamir_service.share_to_hex(share)
        panelist.key_share_hash = shamir_service.hash_share(share)
        panelist.key_share_encrypted = share_hex   # stored for demo; in prod: client-only
        share_map[panelist.email] = share_hex

    # Persist public key
    db.add(InstitutionKey(public_key_pem=public_key_pem))
    await db.flush()

    return SetupKeysResponse(public_key_pem=public_key_pem, shares=share_map)


@router.get(
    "/my-share",
    summary="[M3] Retrieve your Shamir key share (requires JWT)",
)
async def get_my_share(
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """Returns the authenticated panelist's hex key share (for demo use)."""
    if not current.key_share_encrypted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Key share not set up yet. Run POST /api/admin/setup-keys first.",
        )
    return {
        "panelist": current.name,
        "email": current.email,
        "key_share": current.key_share_encrypted,
    }


# ── M3: Approval / rejection ──────────────────────────────────────────────────

@router.post(
    "/approve/{request_id}",
    response_model=ApproveResponse,
    summary="[M3/M4] Approve a registration — submit key share; issues DID+VC at threshold",
)
async def approve_registration(
    request_id: uuid.UUID,
    body: ApproveRequest,
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """
    Each panelist submits their Shamir key share.
    When SHAMIR_THRESHOLD shares are collected:
      - Master key is reconstructed from shares
      - DID + W3C VC are issued for the student (M4)
      - Registration is marked approved
      - Shares are cleared from DB
    Returns ApproveResponse; identity fields populated only at threshold.
    """
    reg = await _get_pending_registration(db, request_id)

    panelist_id_str = str(current.panelist_id)

    # Prevent double-voting
    if panelist_id_str in (reg.approver_ids or []):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already voted on this registration.",
        )

    # Verify the submitted share
    if not current.key_share_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your key share has not been set up. Run /api/admin/setup-keys first.",
        )
    if not shamir_service.verify_share(body.key_share, current.key_share_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid key share. Please check your share and try again.",
        )

    # Collect the share
    new_shares = list(reg.collected_shares or []) + [body.key_share]
    new_approver_ids = list(reg.approver_ids or []) + [panelist_id_str]
    new_approvals = (reg.approvals_count or 0) + 1

    if new_approvals >= settings.SHAMIR_THRESHOLD:
        # Threshold reached — reconstruct master key and verify
        institution_key = await _get_institution_key(db)
        combined_bytes = shamir_service.combine_shares(
            [shamir_service.hex_to_share(s) for s in new_shares]
        )
        if not shamir_service.verify_key_pair(combined_bytes, institution_key.public_key_pem):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Key reconstruction failed — shares may be inconsistent.",
            )

        # Issue DID + VC (M4) — timed for M11 dashboard
        did_record, cred_record, student_private_key_b64 = await metrics_service.record(
            db,
            "did_creation",
            did_service.issue_identity(db, reg, combined_bytes, institution_key.public_key_pem),
            email=reg.email,
        )

        # Mark registration approved; clear shares
        reg.status = "approved"
        reg.collected_shares = []
        reg.approver_ids = new_approver_ids
        reg.approvals_count = new_approvals
        reg.updated_at = datetime.now(timezone.utc)
        await db.flush()

        return ApproveResponse(
            registration=RegistrationOut.model_validate(reg),
            student_did=did_record.did,
            did_document=did_record.did_document,
            vc_json=cred_record.vc_json,
            student_private_key_b64=student_private_key_b64,
            blockchain_hash=did_record.blockchain_hash,
        )
    else:
        reg.collected_shares = new_shares
        reg.approver_ids = new_approver_ids
        reg.approvals_count = new_approvals
        reg.updated_at = datetime.now(timezone.utc)
        await db.flush()

    return ApproveResponse(registration=RegistrationOut.model_validate(reg))


@router.post(
    "/reject/{request_id}",
    response_model=RegistrationOut,
    summary="[M3] Reject a registration",
)
async def reject_registration(
    request_id: uuid.UUID,
    body: RejectRequest,
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """Any panelist can reject. First rejection marks the registration as rejected."""
    reg = await _get_pending_registration(db, request_id)

    panelist_id_str = str(current.panelist_id)
    if panelist_id_str in (reg.approver_ids or []):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already voted on this registration.",
        )

    reg.status = "rejected"
    reg.rejections_count = (reg.rejections_count or 0) + 1
    reg.approver_ids = list(reg.approver_ids or []) + [panelist_id_str]
    reg.rejection_reason = body.reason
    reg.collected_shares = []    # discard any accumulated shares
    reg.updated_at = datetime.now(timezone.utc)

    await db.flush()
    return reg


@router.post(
    "/approve-batch",
    summary="[M3] Batch-approve all pending registrations with your key share",
)
async def approve_batch(
    body: BatchApproveRequest,
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """
    Applies the panelist's share to every pending registration in one call.
    Useful for batch onboarding 600+ students.
    Returns a summary of how many registrations were updated / newly approved.
    """
    if not current.key_share_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Key share not set up. Run /api/admin/setup-keys first.",
        )
    if not shamir_service.verify_share(body.key_share, current.key_share_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid key share.",
        )

    result = await db.execute(
        select(RegistrationRequest).where(RegistrationRequest.status == "pending")
    )
    pending = result.scalars().all()

    institution_key = await _get_institution_key(db)
    panelist_id_str = str(current.panelist_id)

    votes_added = 0
    newly_approved = 0
    batch_start = time.perf_counter()

    for reg in pending:
        if panelist_id_str in (reg.approver_ids or []):
            continue   # already voted

        new_shares = list(reg.collected_shares or []) + [body.key_share]
        new_approver_ids = list(reg.approver_ids or []) + [panelist_id_str]
        new_approvals = (reg.approvals_count or 0) + 1
        votes_added += 1

        if new_approvals >= settings.SHAMIR_THRESHOLD:
            combined_bytes = shamir_service.combine_shares(
                [shamir_service.hex_to_share(s) for s in new_shares]
            )
            if shamir_service.verify_key_pair(combined_bytes, institution_key.public_key_pem):
                await metrics_service.record(
                    db,
                    "did_creation",
                    did_service.issue_identity(db, reg, combined_bytes, institution_key.public_key_pem),
                    email=reg.email,
                    batch=True,
                )
                reg.status = "approved"
                reg.collected_shares = []
                newly_approved += 1
            else:
                reg.collected_shares = new_shares   # don't approve if key check fails
        else:
            reg.collected_shares = new_shares

        reg.approver_ids = new_approver_ids
        reg.approvals_count = new_approvals
        reg.updated_at = datetime.now(timezone.utc)

    await db.flush()

    # Record batch timing metric
    batch_ms = round((time.perf_counter() - batch_start) * 1000, 3)
    from app.models.metrics import Metric
    db.add(Metric(
        operation="batch_approval",
        duration_ms=batch_ms,
        result="SUCCESS",
        meta={"batch_size": votes_added, "newly_approved": newly_approved},
    ))

    return {
        "pending_total": len(pending),
        "votes_added": votes_added,
        "newly_approved": newly_approved,
        "still_pending": len(pending) - newly_approved,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_pending_registration(
    db: AsyncSession, request_id: uuid.UUID
) -> RegistrationRequest:
    result = await db.execute(
        select(RegistrationRequest).where(
            RegistrationRequest.request_id == request_id,
            RegistrationRequest.status == "pending",
        )
    )
    reg = result.scalar_one_or_none()
    if reg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending registration not found.",
        )
    return reg


async def _get_institution_key(db: AsyncSession) -> InstitutionKey:
    result = await db.execute(select(InstitutionKey))
    key = result.scalars().first()
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Institution key not set up. Run POST /api/admin/setup-keys first.",
        )
    return key


# pending-updates and approve-update are implemented in data_updates.py router
