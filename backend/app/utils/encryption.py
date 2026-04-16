"""
v4 VC Encryption — AES-256-GCM

Encrypts the VC JSON with a random AES-256 key, then wraps that key using the
student's ECDSA P-256 public key via ECIES (ECDH + HKDF + AES-GCM).

Layout of the encrypted_vc JSON payload stored in the Credential row:
{
  "version": "v4",
  "alg":     "ECDH-ES+AES256GCM",
  "epk_x":   "<base64 ephemeral pubkey X>",  # 32 bytes
  "epk_y":   "<base64 ephemeral pubkey Y>",  # 32 bytes
  "key_iv":  "<base64 12-byte nonce for key encryption>",
  "enc_key": "<base64 wrapped 32-byte AES key>",  # 32+16 bytes (with GCM tag)
  "iv":      "<base64 12-byte nonce for VC encryption>",
  "ct":      "<base64 ciphertext of vc_json bytes + 16-byte GCM tag>"
}

The student decrypts client-side using:
  1. ECDH: sharedSecret = theirPrivKey × epk_pubkey
  2. HKDF-SHA256 → 32-byte wrapping key
  3. AES-256-GCM decrypt enc_key → aes_key
  4. AES-256-GCM decrypt ct → vc_json
"""

import json
import os
import base64
from cryptography.hazmat.primitives.asymmetric.ec import (
    ECDH, EllipticCurvePublicKey, generate_private_key, SECP256R1,
    EllipticCurvePublicNumbers, EllipticCurvePrivateNumbers,
)
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _load_p256_public(raw_xy_64: bytes) -> EllipticCurvePublicKey:
    """Load a P-256 public key from raw 64-byte X‖Y (no 0x04 prefix)."""
    x = int.from_bytes(raw_xy_64[:32], "big")
    y = int.from_bytes(raw_xy_64[32:], "big")
    return EllipticCurvePublicNumbers(x, y, SECP256R1()).public_key(default_backend())


def encrypt_vc(vc_dict: dict, recipient_public_key_b64: str) -> dict:
    """
    Encrypt a VC dictionary for the given P-256 recipient public key.

    :param vc_dict: The plain VC as a Python dict.
    :param recipient_public_key_b64: Base64-encoded raw 64-byte X‖Y public key.
    :return: encrypted_vc payload dict (JSON-serialisable).
    """
    # Decode recipient public key (raw 64 bytes)
    pub_bytes = base64.b64decode(recipient_public_key_b64)
    if len(pub_bytes) != 64:
        raise ValueError(f"Expected 64-byte raw public key, got {len(pub_bytes)}")
    recipient_pub = _load_p256_public(pub_bytes)

    # Generate ephemeral key pair
    ephem_priv = generate_private_key(SECP256R1(), default_backend())
    ephem_pub = ephem_priv.public_key()

    # ECDH shared secret
    shared_secret = ephem_priv.exchange(ECDH(), recipient_pub)

    # HKDF → 32-byte wrapping key
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"SecureDID-v4-VC-wrap",
        backend=default_backend(),
    )
    wrapping_key = hkdf.derive(shared_secret)

    # Generate random AES-256 content key
    aes_key = os.urandom(32)

    # Wrap the AES key with HKDF-derived key
    key_iv = os.urandom(12)
    enc_key = AESGCM(wrapping_key).encrypt(key_iv, aes_key, None)

    # Encrypt VC JSON
    vc_bytes = json.dumps(vc_dict, sort_keys=True, separators=(",", ":")).encode()
    iv = os.urandom(12)
    ct = AESGCM(aes_key).encrypt(iv, vc_bytes, None)

    # Serialise ephemeral public key coordinates
    ephem_pub_nums = ephem_pub.public_key().public_numbers() if hasattr(ephem_pub, "public_key") else ephem_pub.public_numbers()
    epk_x = ephem_pub_nums.x.to_bytes(32, "big")
    epk_y = ephem_pub_nums.y.to_bytes(32, "big")

    return {
        "version": "v4",
        "alg":     "ECDH-ES+AES256GCM",
        "epk_x":   _b64(epk_x),
        "epk_y":   _b64(epk_y),
        "key_iv":  _b64(key_iv),
        "enc_key": _b64(enc_key),
        "iv":      _b64(iv),
        "ct":      _b64(ct),
    }


def decrypt_vc(encrypted_vc: dict, private_key_b64: str) -> dict:
    """
    Decrypt a v4-encrypted VC payload (server-side, for admin use only).

    :param encrypted_vc: The encrypted_vc dict as stored in the DB.
    :param private_key_b64: Base64-encoded raw 32-byte P-256 private key scalar.
    :return: Decrypted VC dict.
    """
    if encrypted_vc.get("version") != "v4":
        raise ValueError("Not a v4 encrypted payload")

    # Reconstruct ephemeral public key
    epk_x = base64.b64decode(encrypted_vc["epk_x"])
    epk_y = base64.b64decode(encrypted_vc["epk_y"])
    ephem_pub = _load_p256_public(epk_x + epk_y)

    # Reconstruct recipient private key
    priv_scalar = int.from_bytes(base64.b64decode(private_key_b64), "big")
    priv_pub_nums = EllipticCurvePrivateNumbers(priv_scalar, ephem_pub.public_numbers())
    # We need a complete private key; reconstruct from scalar alone (not stored — demo only)
    raise NotImplementedError("Server-side decryption not supported in demo. Decrypt client-side.")
