"""
IPFS / Pinata storage service (v4)

Uploads encrypted VC payloads to IPFS via the Pinata API and returns the CID.
Falls back gracefully if Pinata credentials are not configured.

Environment variables:
  PINATA_API_KEY     — Pinata API key
  PINATA_SECRET_KEY  — Pinata secret API key
  IPFS_GATEWAY       — Public gateway base URL (default: https://gateway.pinata.cloud/ipfs)
"""

import json
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_PINATA_BASE = "https://api.pinata.cloud"
_DEFAULT_GATEWAY = "https://gateway.pinata.cloud/ipfs"


def _gateway() -> str:
    return getattr(settings, "IPFS_GATEWAY", _DEFAULT_GATEWAY).rstrip("/")


def _headers() -> dict[str, str]:
    api_key = getattr(settings, "PINATA_API_KEY", "")
    secret_key = getattr(settings, "PINATA_SECRET_KEY", "")
    if not api_key or not secret_key:
        raise RuntimeError("Pinata credentials not configured (PINATA_API_KEY / PINATA_SECRET_KEY)")
    return {
        "pinata_api_key": api_key,
        "pinata_secret_api_key": secret_key,
        "Content-Type": "application/json",
    }


async def upload_to_ipfs(payload: dict, name: str = "vc") -> str:
    """
    Upload a JSON payload to IPFS via Pinata.

    :param payload: JSON-serialisable dict to upload.
    :param name: Human-readable name for the pin.
    :return: IPFS CID string.
    :raises RuntimeError: if credentials missing or upload fails.
    """
    headers = _headers()
    body = {
        "pinataContent": payload,
        "pinataMetadata": {"name": name},
        "pinataOptions": {"cidVersion": 1},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{_PINATA_BASE}/pinning/pinJSONToIPFS",
            headers=headers,
            content=json.dumps(body),
        )

    if r.status_code != 200:
        raise RuntimeError(f"Pinata upload failed ({r.status_code}): {r.text}")

    cid: str = r.json()["IpfsHash"]
    logger.info("Uploaded to IPFS: cid=%s name=%s", cid, name)
    return cid


async def fetch_from_ipfs(cid: str) -> dict:
    """
    Fetch a JSON payload from IPFS via the configured gateway.

    :param cid: IPFS CID string.
    :return: Parsed JSON dict.
    """
    url = f"{_gateway()}/{cid}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
    r.raise_for_status()
    return r.json()


def gateway_url(cid: str) -> str:
    """Return the public gateway URL for a given CID."""
    return f"{_gateway()}/{cid}"


async def upload_encrypted_vc(
    encrypted_vc: dict,
    holder_did: str,
) -> Optional[str]:
    """
    Upload an encrypted VC payload to IPFS.
    Returns the CID on success, None if Pinata is not configured (graceful fallback).

    :param encrypted_vc: Output from encryption.encrypt_vc().
    :param holder_did: Used as part of the pin name for traceability.
    :return: CID string or None.
    """
    try:
        short_did = holder_did[-12:] if len(holder_did) > 12 else holder_did
        cid = await upload_to_ipfs(encrypted_vc, name=f"vc-{short_did}")
        return cid
    except RuntimeError as exc:
        if "not configured" in str(exc):
            logger.warning("Pinata not configured — skipping IPFS upload (VC stored in DB only)")
            return None
        logger.error("IPFS upload failed: %s", exc)
        return None
