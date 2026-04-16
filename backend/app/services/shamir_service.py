"""
Shamir's Secret Sharing service for the master institution signing key.

Operations:
  - generate_master_key()          → (private_key_bytes, public_key_pem)
  - split_key(privkey, n, k)       → list of n shares (bytearray)
  - combine_shares(shares)         → private_key_bytes
  - hash_share(share)              → SHA-256 hex digest
  - verify_share(share_hex, hash)  → bool
  - share_to_hex(share)            → hex string (for DB storage)
  - hex_to_share(hex_str)          → bytearray (for pyshamir.combine)
  - sign_bytes(privkey_bytes, data)     → DER-encoded signature (hex)
  - verify_signature(pubkey_pem, data, sig_hex) → bool
"""
import hashlib

from ecdsa import SigningKey, VerifyingKey, NIST256p, BadSignatureError
from pyshamir import split, combine


# ── Key generation ────────────────────────────────────────────────────────────

def generate_master_key() -> tuple[bytes, str]:
    """Generate an ECDSA P-256 key pair.

    Returns:
        (private_key_bytes, public_key_pem_str)
    """
    sk = SigningKey.generate(curve=NIST256p)
    return sk.to_string(), sk.get_verifying_key().to_pem().decode()


# ── Shamir operations ─────────────────────────────────────────────────────────

def split_key(private_key_bytes: bytes, n: int = 5, k: int = 3) -> list[bytearray]:
    """Split a private key into n shares with threshold k."""
    return split(private_key_bytes, n, k)


def combine_shares(shares: list[bytearray]) -> bytes:
    """Reconstruct a private key from k or more Shamir shares."""
    return bytes(combine(shares))


# ── Share encoding / hashing ─────────────────────────────────────────────────

def share_to_hex(share: bytearray) -> str:
    return bytes(share).hex()


def hex_to_share(hex_str: str) -> bytearray:
    return bytearray(bytes.fromhex(hex_str))


def hash_share(share: bytearray) -> str:
    """SHA-256 hash of a share for DB storage / verification."""
    return hashlib.sha256(bytes(share)).hexdigest()


def verify_share(share_hex: str, expected_hash: str) -> bool:
    """Verify a hex-encoded share against its stored SHA-256 hash."""
    try:
        share_bytes = bytes.fromhex(share_hex)
    except ValueError:
        return False
    return hashlib.sha256(share_bytes).hexdigest() == expected_hash


# ── Signing / verification ────────────────────────────────────────────────────

def sign_bytes(private_key_bytes: bytes, data: bytes) -> str:
    """Sign *data* with the private key; return DER signature as hex."""
    sk = SigningKey.from_string(private_key_bytes, curve=NIST256p)
    return sk.sign_deterministic(data).hex()


def verify_signature(public_key_pem: str, data: bytes, signature_hex: str) -> bool:
    """Verify a DER hex signature against *data* using the PEM public key."""
    try:
        vk = VerifyingKey.from_pem(public_key_pem)
        sig_bytes = bytes.fromhex(signature_hex)
        return vk.verify(sig_bytes, data)
    except (BadSignatureError, ValueError):
        return False


# ── Integrity check ───────────────────────────────────────────────────────────

def verify_key_pair(private_key_bytes: bytes, public_key_pem: str) -> bool:
    """Verify that a private key corresponds to the stored public key."""
    test_data = b"securedid-key-verification"
    try:
        sig = sign_bytes(private_key_bytes, test_data)
        return verify_signature(public_key_pem, test_data, sig)
    except Exception:
        return False
