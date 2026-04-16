from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DIDDocument(Base):
    __tablename__ = "did_documents"

    # Primary key is the DID string itself
    did: Mapped[str] = mapped_column(String(255), primary_key=True)
    # Base64-encoded public key
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    # Full W3C DID Document as JSON-LD
    did_document: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # SHA-256 hash stored on-chain (or simulated hash store)
    blockchain_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
