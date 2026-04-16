"""
DID + Verifiable Credential issuance service.

Pipeline (triggered when Shamir threshold is reached in M3):
  1. Generate ECDSA P-256 key pair for the student
  2. Derive DID: did:securedid:<sha256(pubkey)[:32]>
  3. Build W3C DID Document (JSON-LD)
  4. Hash DID Document → anchor on Base Sepolia (non-blocking)
  5. Assign next revocation index from RevocationRegistry
  6. Build W3C Verifiable Credential (JSON-LD)
  7. Sign VC with institution master private key (reconstructed from Shamir shares)
  8. Persist DIDDocument + Credential to DB
  9. Mark csv_records row as registered
 10. Return DID + VC + student private key (private key for demo only)
"""
import base64
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.credential import Credential
from app.models.csv_record import CSVRecord
from app.models.did_document import DIDDocument
from app.models.registration import RegistrationRequest
from app.models.revocation import RevocationRegistry
from app.services import blockchain_service
from app.utils.crypto import generate_key_pair, hash_did_document, public_key_to_b64
from app.services.shamir_service import sign_bytes
from app.utils.encryption import encrypt_vc
from app.services.ipfs_service import upload_encrypted_vc

# Fixed institution DID (the "issuer" in every VC)
INSTITUTION_DID = "did:securedid:institution"


# ── DID construction ──────────────────────────────────────────────────────────

def derive_did(public_key_bytes: bytes) -> str:
    """Derive a deterministic DID from a student's public key."""
    hex_id = hashlib.sha256(public_key_bytes).hexdigest()[:32]
    return f"did:securedid:{hex_id}"


def build_did_document(did: str, public_key_bytes: bytes) -> dict:
    """Build a W3C-compliant DID Document (JSON-LD)."""
    public_key_b64 = base64.b64encode(public_key_bytes).decode()
    return {
        "@context": "https://www.w3.org/ns/did/v1",
        "id": did,
        "authentication": [
            {
                "id": f"{did}#key-1",
                "type": "EcdsaSecp256r1VerificationKey2019",
                "controller": did,
                "publicKeyBase64": public_key_b64,
            }
        ],
        "service": [],
    }


# ── Revocation index assignment ───────────────────────────────────────────────

async def assign_revocation_index(db: AsyncSession) -> int:
    """Claim the next available slot in the revocation bitstring."""
    result = await db.execute(select(RevocationRegistry))
    registry = result.scalars().first()
    if registry is None:
        registry = RevocationRegistry()
        db.add(registry)
        await db.flush()

    index = registry.next_index
    registry.next_index = index + 1
    registry.last_updated = datetime.now(timezone.utc)
    return index


# ── VC construction ───────────────────────────────────────────────────────────

def build_vc(
    student_did: str,
    registration: RegistrationRequest,
    revocation_index: int,
    issued_at: datetime,
) -> dict:
    """Build a W3C Verifiable Credential (without proof)."""
    expires_at = issued_at + timedelta(days=settings.CREDENTIAL_EXPIRY_DAYS)

    # Stable photo hash placeholder (hash of roll_number + full_name)
    photo_hash = "sha256:" + hashlib.sha256(
        (registration.roll_number + registration.full_name).encode()
    ).hexdigest()

    return {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
        ],
        "id": f"urn:uuid:{uuid.uuid4()}",
        "type": ["VerifiableCredential", "StudentCredential"],
        "issuer": INSTITUTION_DID,
        "issuanceDate": issued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expirationDate": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "credentialSubject": {
            "id": student_did,
            "name": registration.full_name,
            "rollNumber": registration.roll_number,
            "department": registration.department,
            "year": registration.year,
            "photoHash": photo_hash,
        },
        "credentialStatus": {
            "type": "BitstringStatusListEntry",
            "statusListIndex": revocation_index,
        },
    }


def sign_vc(vc_body: dict, institution_private_key_bytes: bytes) -> dict:
    """
    Sign the VC and embed the proof.

    Signing input: canonical JSON of vc_body (sorted keys, no separators),
    then SHA-256 hashed.
    """
    canonical = json.dumps(vc_body, sort_keys=True, separators=(",", ":"))
    data_hash = hashlib.sha256(canonical.encode()).digest()
    signature_hex = sign_bytes(institution_private_key_bytes, data_hash)

    vc_with_proof = dict(vc_body)
    vc_with_proof["proof"] = {
        "type": "EcdsaSecp256r1Signature2019",
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "verificationMethod": f"{INSTITUTION_DID}#key-1",
        "proofPurpose": "assertionMethod",
        "proofValue": signature_hex,
    }
    return vc_with_proof


# ── Main issuance pipeline ────────────────────────────────────────────────────

async def issue_identity(
    db: AsyncSession,
    registration: RegistrationRequest,
    institution_private_key_bytes: bytes,
    institution_public_key_pem: str,
) -> tuple[DIDDocument, Credential, str]:
    """
    Full DID + VC issuance for an approved registration.

    Returns:
        (did_document_record, credential_record, student_private_key_b64)
    """
    now = datetime.now(timezone.utc)

    # 1. Student key pair
    student_private_key, student_public_key = generate_key_pair()

    # 2. Derive DID
    did = derive_did(student_public_key)

    # 3. DID Document
    did_doc_json = build_did_document(did, student_public_key)

    # 4. Hash + anchor (non-blocking)
    doc_hash = hash_did_document(did_doc_json)
    blockchain_hash = await blockchain_service.anchor_did_hash(did, doc_hash)

    # 5. Revocation index
    rev_index = await assign_revocation_index(db)

    # 6. Build + sign VC
    vc_body = build_vc(did, registration, rev_index, now)
    vc_with_proof = sign_vc(vc_body, institution_private_key_bytes)

    # 7. Persist DID Document
    expires_at = now + timedelta(days=settings.CREDENTIAL_EXPIRY_DAYS)

    did_record = DIDDocument(
        did=did,
        public_key=public_key_to_b64(student_public_key),
        did_document=did_doc_json,
        blockchain_hash=blockchain_hash,
        is_active=True,
    )
    db.add(did_record)

    # 8. Encrypt VC for student (v4) + optionally upload to IPFS
    # Student public key: raw 64-byte X‖Y encoded as base64
    student_pub_b64 = public_key_to_b64(student_public_key)  # stored in DID doc
    try:
        encrypted = encrypt_vc(vc_with_proof, student_pub_b64)
    except Exception:
        encrypted = None  # graceful fallback — vc_json still stored plain

    vc_cid: str | None = None
    if encrypted:
        vc_cid = await upload_encrypted_vc(encrypted, did)

    # 8b. Persist Credential (keep plain vc_json for backwards compat + admin use)
    cred_record = Credential(
        holder_did=did,
        vc_json=vc_with_proof,
        encrypted_vc=encrypted,
        vc_cid=vc_cid,
        revocation_index=rev_index,
        is_revoked=False,
        issued_at=now,
        expires_at=expires_at,
    )
    db.add(cred_record)

    # 9. Mark CSV record as registered
    if registration.csv_record_id:
        csv_result = await db.execute(
            select(CSVRecord).where(CSVRecord.record_id == registration.csv_record_id)
        )
        csv_rec = csv_result.scalar_one_or_none()
        if csv_rec:
            csv_rec.is_registered = True

    await db.flush()

    # 10. Return; student private key as base64 (demo only)
    student_private_key_b64 = base64.b64encode(student_private_key).decode()
    return did_record, cred_record, student_private_key_b64
