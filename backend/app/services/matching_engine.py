"""
5-field student matching engine.

Security rule: ALL failures return the SAME generic HTTP 400.
No hints about which field failed — prevents enumeration attacks.
"""
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.csv_record import CSVRecord
from app.models.registration import RegistrationRequest
from app.schemas.registration import StudentRegisterRequest
from app.utils.hashing import verify_secret_key

_FAIL = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="Registration failed. Please verify your details and try again.",
)


async def verify_and_create_registration(
    db: AsyncSession,
    data: StudentRegisterRequest,
) -> RegistrationRequest:
    """
    1. Match all 5 fields + secret_key against csv_records.
    2. Ensure student hasn't already registered.
    3. Create a pending RegistrationRequest.

    Raises HTTP 400 with a generic message on any mismatch.
    """
    # ── Step 1: 5-field lookup ───────────────────────────────────────────────
    # dob is optional from the web form; if not provided, skip it (4-field match)
    conditions = [
        CSVRecord.email == data.email.lower(),
        CSVRecord.roll_number == data.roll_number.upper(),
        CSVRecord.department == data.department.upper(),
        CSVRecord.year == data.year,
        CSVRecord.is_registered == False,  # noqa: E712
    ]
    if data.dob:
        conditions.append(CSVRecord.dob == data.dob)

    result = await db.execute(select(CSVRecord).where(and_(*conditions)))
    record = result.scalar_one_or_none()

    # Generic failure — intentionally identical for every failure path
    if record is None:
        raise _FAIL

    # ── Step 2: Verify secret key (6th implicit check) ───────────────────────
    if not verify_secret_key(data.secret_key, record.secret_key_hash):
        raise _FAIL

    # ── Step 3: Check for duplicate pending/approved registration ────────────
    existing_reg = await db.execute(
        select(RegistrationRequest).where(
            RegistrationRequest.email == data.email.lower(),
            RegistrationRequest.status.in_(["pending", "approved"]),
        )
    )
    if existing_reg.scalar_one_or_none() is not None:
        # Same generic message — don't reveal that the student already registered
        raise _FAIL

    # ── Step 4: Create pending registration ──────────────────────────────────
    reg = RegistrationRequest(
        email=data.email.lower(),
        roll_number=data.roll_number.upper(),
        full_name=data.full_name,
        department=data.department.upper(),
        year=data.year,
        csv_match=True,
        csv_record_id=record.record_id,
        status="pending",
        approvals_count=0,
        rejections_count=0,
        approver_ids=[],
        collected_shares=[],
    )
    db.add(reg)
    await db.flush()   # get request_id without committing

    return reg
