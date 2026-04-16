import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class PanelistCreate(BaseModel):
    name: str
    email: EmailStr
    department: str
    password: str


class PanelistOut(BaseModel):
    panelist_id: uuid.UUID
    name: str
    email: str
    department: str
    eth_address: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PanelistLogin(BaseModel):
    email: EmailStr
    password: str


class PanelistTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    panelist: PanelistOut


class WalletChallengeRequest(BaseModel):
    eth_address: str   # 0x… lowercase

class WalletChallengeResponse(BaseModel):
    challenge: str     # message to sign with MetaMask

class WalletVerifyRequest(BaseModel):
    eth_address: str
    signature: str     # hex signature from MetaMask

class WalletLinkRequest(BaseModel):
    eth_address: str   # address to link to current panelist


class SetupKeysResponse(BaseModel):
    """Returned once when master key is set up. Contains each panelist's share."""
    public_key_pem: str
    # Maps panelist email → hex-encoded Shamir share (save securely — never shown again)
    shares: dict[str, str]
    message: str = "Master key generated. Save each panelist's share — it will NOT be shown again."
