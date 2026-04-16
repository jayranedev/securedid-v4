"""ECDSA P-256 helpers used across the backend."""
import base64
import hashlib

from ecdsa import SigningKey, VerifyingKey, NIST256p


def generate_key_pair() -> tuple[bytes, bytes]:
    """Return (private_key_bytes, public_key_bytes) for NIST P-256."""
    sk = SigningKey.generate(curve=NIST256p)
    vk = sk.get_verifying_key()
    return sk.to_string(), vk.to_string()


def sign_data(private_key_bytes: bytes, data: bytes) -> bytes:
    sk = SigningKey.from_string(private_key_bytes, curve=NIST256p)
    return sk.sign(data)


def verify_signature(public_key_bytes: bytes, data: bytes, signature: bytes) -> bool:
    try:
        vk = VerifyingKey.from_string(public_key_bytes, curve=NIST256p)
        return vk.verify(signature, data)
    except Exception:
        return False


def public_key_to_b64(public_key_bytes: bytes) -> str:
    return base64.b64encode(public_key_bytes).decode()


def b64_to_public_key(b64: str) -> bytes:
    return base64.b64decode(b64)


def hash_did_document(did_document: dict) -> str:
    """Return SHA-256 hex digest of the canonical JSON representation."""
    import json
    canonical = json.dumps(did_document, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()
