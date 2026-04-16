import uuid
from datetime import datetime
from pydantic import BaseModel


class RevokeStudentRequest(BaseModel):
    credential_id: uuid.UUID
    reason: str | None = None


class AccessGrantRequest(BaseModel):
    student_did: str
    platform_name: str
    platform_domain: str
    ttl_minutes: int | None = None   # None = permanent until manual revoke


class AccessGrantOut(BaseModel):
    grant_id: uuid.UUID
    student_did: str
    platform_name: str
    platform_domain: str
    granted_at: datetime
    expires_at: datetime | None
    is_revoked: bool

    model_config = {"from_attributes": True}


class RevocationStatusOut(BaseModel):
    credential_id: uuid.UUID
    is_revoked: bool
    revocation_index: int
