import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Panelist(Base):
    __tablename__ = "panelists"

    panelist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    # Hashed version of their Shamir key share (for verification only)
    key_share_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Encrypted key share stored server-side (delivered once to panelist)
    key_share_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # Base Sepolia wallet address (0x…, lowercase) — optional, enables wallet-based auth
    eth_address: Mapped[str | None] = mapped_column(String(42), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
