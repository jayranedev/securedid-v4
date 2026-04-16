import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Metric(Base):
    __tablename__ = "metrics"

    metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    operation: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    duration_ms: Mapped[float] = mapped_column(Float, nullable=False)
    # SUCCESS | FAILURE
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True, name="metadata")
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
