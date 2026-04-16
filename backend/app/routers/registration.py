"""
Student registration router.

POST /api/register — public endpoint.
Always returns the same generic error on any mismatch (no enumeration hints).
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.registration import StudentRegisterRequest, RegistrationOut
from app.services import matching_engine, metrics_service

router = APIRouter()


@router.post(
    "/register",
    response_model=RegistrationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Student registration (all 5 fields + secret key must match CSV)",
)
async def register_student(
    body: StudentRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Validates 5 fields (email, roll_number, dob, department, year) plus the
    secret_key against the panelist-uploaded CSV data.

    On any mismatch, returns HTTP 400 with a generic message.
    No field-level hints are ever provided.
    """
    reg = await metrics_service.record(
        db,
        "csv_match",
        matching_engine.verify_and_create_registration(db, body),
        department=body.department.upper(),
    )
    return reg
