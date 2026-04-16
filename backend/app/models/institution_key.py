"""
InstitutionKey — stores the master ECDSA P-256 public key for the institution.

Created once via POST /api/admin/setup-keys (M3).
The matching private key is Shamir-split across the 5 panelists.
"""
from datetime import datetime, timezone
from sqlalchemy import Text, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InstitutionKey(Base):
    __tablename__ = "institution_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # PEM-encoded ECDSA P-256 verifying (public) key
    public_key_pem: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
