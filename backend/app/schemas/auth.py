from pydantic import BaseModel


class ChallengeResponse(BaseModel):
    nonce: str
    domain: str
    expires_in_seconds: int


class VPVerifyRequest(BaseModel):
    verifiable_presentation: dict
    domain: str


class AuthSuccessResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    did: str
    holder_name: str
    is_suspicious: bool = False  # M12: True when multi-IP anomaly detected
