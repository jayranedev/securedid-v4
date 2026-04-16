"""Shared FastAPI dependency functions."""
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.panelist import Panelist
from app.utils.jwt_utils import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


async def get_current_panelist(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Panelist:
    """Decode JWT and return the active panelist, or raise 401."""
    unauth = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        panelist_id_str: str | None = payload.get("sub")
        if not panelist_id_str:
            raise unauth
        panelist_id = uuid.UUID(panelist_id_str)
    except (JWTError, ValueError):
        raise unauth

    result = await db.execute(
        select(Panelist).where(
            Panelist.panelist_id == panelist_id,
            Panelist.is_active == True,  # noqa: E712
        )
    )
    panelist = result.scalar_one_or_none()
    if not panelist:
        raise unauth
    return panelist
