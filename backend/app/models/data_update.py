import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DataUpdateRequest(Base):
    __tablename__ = "data_update_requests"

    update_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_did: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    old_value: Mapped[str] = mapped_column(Text, nullable=False)
    new_value: Mapped[str] = mapped_column(Text, nullable=False)
    # Whether this change requires a new VC to be issued
    requires_vc_reissue: Mapped[bool] = mapped_column(Boolean, default=False)
    approvals_count: Mapped[int] = mapped_column(Integer, default=0)
    approver_ids: Mapped[list] = mapped_column(JSONB, default=list)
    collected_shares: Mapped[list] = mapped_column(JSONB, default=list)
    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
