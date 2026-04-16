"""
DID resolution endpoints.

GET /api/did/{did}         — resolve DID → DID Document (public, no auth required)
GET /api/credentials/{did} — get credentials for a DID (public, returns public fields only)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.credential import Credential
from app.models.did_document import DIDDocument
from app.schemas.credential import CredentialOut, DIDDocumentOut

router = APIRouter()


@router.get(
    "/did/{did}",
    response_model=DIDDocumentOut,
    summary="Resolve a DID to its DID Document",
)
async def resolve_did(did: str, db: AsyncSession = Depends(get_db)):
    """
    Returns the W3C DID Document for a given DID.
    Returns 404 if the DID is unknown or inactive.
    """
    result = await db.execute(
        select(DIDDocument).where(
            DIDDocument.did == did,
            DIDDocument.is_active == True,  # noqa: E712
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DID '{did}' not found.",
        )
    return doc


@router.get(
    "/credentials/{did}",
    response_model=list[CredentialOut],
    summary="Get all credentials for a DID",
)
async def get_credentials(did: str, db: AsyncSession = Depends(get_db)):
    """
    Returns all non-revoked credentials issued to a DID.
    Returns an empty list if the DID has no credentials.
    """
    result = await db.execute(
        select(Credential).where(
            Credential.holder_did == did,
            Credential.is_revoked == False,  # noqa: E712
        )
    )
    return result.scalars().all()
