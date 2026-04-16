import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuthAuditLog(Base):
    __tablename__ = "auth_audit_log"

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    did_attempted: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # college-portal | university-portal | unknown
    portal: Mapped[str] = mapped_column(String(100), nullable=False)
    nonce_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # SUCCESS | FAILURE
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    # Which of the 5 checks failed (1-5), NULL if success
    failure_check: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Generic message shown to user
    failure_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # M12: True if same DID was seen from a different IP within ANOMALY_WINDOW_SECONDS
    is_anomaly: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
