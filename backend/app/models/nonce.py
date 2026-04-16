from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Nonce(Base):
    __tablename__ = "nonce_store"

    # 32-char hex nonce is the primary key
    nonce: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Portal domain that requested this nonce
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    # DID that consumed this nonce
    used_by_did: Mapped[str | None] = mapped_column(String(255), nullable=True)
