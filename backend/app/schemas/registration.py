import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, EmailStr


class StudentRegisterRequest(BaseModel):
    email: EmailStr
    roll_number: str
    full_name: str
    dob: str = ""     # YYYY-MM-DD (optional for web registration; matching engine accepts empty)
    department: str
    year: int
    secret_key: str   # plaintext; backend hashes and compares


class RegistrationOut(BaseModel):
    request_id: uuid.UUID
    email: str
    roll_number: str
    full_name: str
    department: str
    year: int
    csv_match: bool
    status: str
    approvals_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ApproveRequest(BaseModel):
    key_share: str    # hex-encoded Shamir share (from panelist's one-time download)


class RejectRequest(BaseModel):
    reason: str | None = None


class BatchApproveRequest(BaseModel):
    key_share: str


class ApproveResponse(BaseModel):
    """Returned by POST /api/admin/approve/{id}. Contains registration + optional issued identity."""
    registration: RegistrationOut
    # Populated only when approval threshold is reached and DID + VC are issued
    student_did: str | None = None
    did_document: dict[str, Any] | None = None
    vc_json: dict[str, Any] | None = None
    # Private key (base64) — ONLY delivered in demo mode; save it, never stored again
    student_private_key_b64: str | None = None
    blockchain_hash: str | None = None
