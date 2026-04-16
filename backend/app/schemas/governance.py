import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class ProposeRequest(BaseModel):
    proposal_type: str      # add_panelist | remove_panelist
    target_panelist_id: uuid.UUID | None = None   # for remove_panelist
    new_panelist_name: str | None = None           # for add_panelist
    new_panelist_email: EmailStr | None = None
    new_panelist_department: str | None = None
    reason: str | None = None


class VoteRequest(BaseModel):
    vote: bool   # True = YES, False = NO


class ProposalOut(BaseModel):
    proposal_id: uuid.UUID
    proposal_type: str
    target_panelist_id: uuid.UUID | None
    new_panelist_name: str | None
    new_panelist_email: str | None
    new_panelist_department: str | None
    proposed_by: uuid.UUID
    reason: str | None
    votes_yes: int
    votes_no: int
    status: str
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class DataUpdateRequestIn(BaseModel):
    student_did: str
    field_name: str
    old_value: str
    new_value: str
    requires_vc_reissue: bool = False


class DataUpdateOut(BaseModel):
    update_id: uuid.UUID
    student_did: str
    field_name: str
    old_value: str
    new_value: str
    requires_vc_reissue: bool
    approvals_count: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ApproveUpdateRequest(BaseModel):
    key_share: str
