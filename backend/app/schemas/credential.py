import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel


class CredentialOut(BaseModel):
    credential_id: uuid.UUID
    holder_did: str
    vc_json: dict[str, Any] | None = None
    # v4 fields
    encrypted_vc: dict[str, Any] | None = None
    vc_cid: str | None = None
    revocation_index: int
    is_revoked: bool
    issued_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


class DIDDocumentOut(BaseModel):
    did: str
    public_key: str
    did_document: dict[str, Any]
    blockchain_hash: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class IssuedIdentityOut(BaseModel):
    did: str
    did_document: dict[str, Any]
    credential: dict[str, Any]
    # Private key returned only in demo mode (server-side generation)
    private_key_b64: str | None = None
