import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RegistrationRequest(Base):
    __tablename__ = "registration_requests"

    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    roll_number: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    csv_match: Mapped[bool] = mapped_column(Boolean, default=False)
    csv_record_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(20), default="pending")
    approvals_count: Mapped[int] = mapped_column(Integer, default=0)
    rejections_count: Mapped[int] = mapped_column(Integer, default=0)
    # JSON array of panelist IDs who have approved
    approver_ids: Mapped[list] = mapped_column(JSONB, default=list)
    # JSON array of collected key share contributions
    collected_shares: Mapped[list] = mapped_column(JSONB, default=list)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
