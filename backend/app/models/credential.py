import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Credential(Base):
    __tablename__ = "credentials"

    credential_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    holder_did: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # Full W3C Verifiable Credential as JSON-LD (plain — kept for backwards compat)
    vc_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # v4: AES-256-GCM encrypted VC payload (see app/utils/encryption.py)
    encrypted_vc: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # v4: IPFS CID where the encrypted_vc is also pinned (optional, None = DB-only)
    vc_cid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Index into the revocation bitstring
    revocation_index: Mapped[int] = mapped_column(Integer, nullable=False)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revocation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON list of panelist UUIDs who have approved the revocation (need 2 of 5)
    revocation_approvers: Mapped[list] = mapped_column(JSONB, default=list, nullable=True)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
