import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GovernanceProposal(Base):
    __tablename__ = "governance_proposals"

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # add_panelist | remove_panelist
    proposal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_panelist_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # For add_panelist: new panelist info
    new_panelist_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    new_panelist_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    new_panelist_department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    proposed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    votes_yes: Mapped[int] = mapped_column(Integer, default=0)
    votes_no: Mapped[int] = mapped_column(Integer, default=0)
    # pending | passed | rejected | expired
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GovernanceVote(Base):
    __tablename__ = "governance_votes"

    vote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    proposal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    panelist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    vote: Mapped[bool] = mapped_column(Boolean, nullable=False)  # True = YES, False = NO
    voted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
