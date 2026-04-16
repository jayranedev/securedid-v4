import uuid
from datetime import datetime, timezone
from sqlalchemy import Integer, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RevocationRegistry(Base):
    __tablename__ = "revocation_registry"

    registry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # 2048-bit bitstring stored as a hex string (512 hex chars = 2048 bits)
    bitstring: Mapped[str] = mapped_column(Text, nullable=False, default="0" * 512)
    # Next available index for new credentials
    next_index: Mapped[int] = mapped_column(Integer, default=0)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
