# SecureDID v4 — CLAUDE.md

> Decentralized Identity Platform for Educational Institutions
> Jay Rane · Don Bosco College of Engineering, Goa

This file is the single source of truth for Claude Code. Keep it updated as modules are built.

---

## Project Summary

SecureDID replaces username/password auth at colleges with wallet-based DID login using W3C standards. Panelists (department heads) collectively issue student digital IDs via a 3-of-5 Shamir multisig. Students authenticate with one click using a browser wallet (Web Crypto API). The system also demonstrates live attack simulations and revocation flows.

---

## Blockchain

**Network: Base Sepolia testnet**
- Chain ID: `84532`
- Public RPC: `https://sepolia.base.org`
- Purpose: anchor SHA-256 hashes of DID Documents on-chain (immutable audit trail)
- Contract: `DIDRegistry` (minimal — stores `did => hash` mapping). Deploy once; set `DID_REGISTRY_CONTRACT_ADDRESS` in `.env`
- Gas wallet: set `ANCHOR_WALLET_PRIVATE_KEY` in `.env` (funded with Base Sepolia ETH from faucet)
- Anchoring is **non-blocking** — DID issuance succeeds even if the on-chain call fails (graceful fallback in `blockchain_service.py`)

**Never use local Ganache/Hardhat for the blockchain layer.**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python), async |
| ORM | SQLAlchemy 2 async + asyncpg |
| DB | PostgreSQL 16 |
| Migrations | Alembic (async-compatible env.py) |
| Crypto (backend) | `ecdsa` (NIST P-256), `pyshamir` (Shamir SSS), `passlib[bcrypt]`, `cryptography` (ECIES) |
| Blockchain | `web3==7.6.0` → Base Sepolia |
| Auth tokens | `python-jose` (JWT HS256) |
| Frontend | Next.js 14 + Tailwind CSS |
| Client crypto | Web Crypto API (ECDSA P-256, keys never leave browser), IndexedDB key storage |
| Storage (v4) | AES-256-GCM encrypted VCs, IPFS/Pinata upload, `vc_cid` stored in DB |
| PDF/QR | `reportlab` + `qrcode[pil]` |
| Charts | Recharts (frontend) |
| HTTP client | `httpx` (async Pinata uploads) |

---

## Running Locally

```bash
# 1. Start Docker Desktop, then start Postgres
docker run -d --name securedid-db \
  -e POSTGRES_DB=securedid \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=securedid \
  -p 5432:5432 postgres:16

# 2. Backend — use the venv, NOT global Python
cd backend
python -m venv venv                        # already exists, skip if present
./venv/Scripts/pip install -r requirements.txt
cp .env.example .env                       # already done; .env is populated
./venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
# Health:     http://localhost:8000/api/health

# 3. Alembic migrations (run once after DB is up; already applied for M1)
./venv/Scripts/python -m alembic upgrade head

# 4. Frontend (once built in M9)
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### Python 3.13 compatibility — verified working versions
| Package | Version | Note |
|---------|---------|------|
| SQLAlchemy | 2.0.36 | 2.0.30 conflicts with Py3.13 `__firstlineno__` |
| asyncpg | 0.31.0 | 0.29 has no Py3.13 wheels |
| pydantic | 2.11.10 | 2.7.x can't build pydantic-core on Py3.13 |
| Pillow | ≥11.0.0 | 10.x fails to build from source |
| web3 | 7.6.0 | 6.x requires C compiler for ckzg on Windows |
| pyshamir | 1.0.4 | API: `split(bytes,n,k)→list[bytearray]`, `combine(list)→bytes` |

---

## Environment Variables (`.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | asyncpg connection string |
| `JWT_SECRET` | Random string, min 32 chars |
| `JWT_EXPIRE_MINUTES` | Default 60 |
| `ALLOWED_ORIGINS` | JSON array of frontend origins |
| `NONCE_TTL_SECONDS` | Auth nonce lifetime, default 30 |
| `SHAMIR_SHARES` | Total key shares, default 5 |
| `SHAMIR_THRESHOLD` | Shares needed to sign, default 3 |
| `CREDENTIAL_EXPIRY_DAYS` | VC validity, default 365 |
| `ANOMALY_WINDOW_SECONDS` | Multi-IP detection window, default 300 |
| `BASE_RPC_URL` | Base Sepolia RPC endpoint |
| `ANCHOR_WALLET_PRIVATE_KEY` | Wallet paying gas for DID anchoring |
| `DID_REGISTRY_CONTRACT_ADDRESS` | Deployed DIDRegistry on Base Sepolia |
| `PINATA_API_KEY` | Pinata API key for IPFS uploads (optional, leave empty to skip) |
| `PINATA_SECRET_KEY` | Pinata secret API key |
| `IPFS_GATEWAY` | Public gateway URL (default: `https://gateway.pinata.cloud/ipfs`) |

---

## Folder Structure (current)

```
BE-Proj-26/
├── CLAUDE.md                          ← this file
├── SecureDID_v3_Complete_Project_Guide.md
├── backend/
│   ├── app/
│   │   ├── main.py                    ← FastAPI app, CORS, lifespan, router registration
│   │   ├── config.py                  ← pydantic-settings from .env
│   │   ├── database.py                ← async engine, session factory, Base, get_db
│   │   ├── models/
│   │   │   ├── __init__.py            ← imports all models (Alembic autodiscover)
│   │   │   ├── panelist.py            ← Panelist (5 admins, key_share_hash)
│   │   │   ├── csv_record.py          ← Authorized student CSV rows
│   │   │   ├── registration.py        ← Student registration queue
│   │   │   ├── did_document.py        ← DID → DID Document (JSONB) + blockchain_hash
│   │   │   ├── credential.py          ← W3C VC (JSONB) + revocation_index
│   │   │   ├── nonce.py               ← Auth challenge nonces (30s TTL)
│   │   │   ├── revocation.py          ← 2048-bit revocation bitstring (hex)
│   │   │   ├── access_grant.py        ← Student → third-party platform grants
│   │   │   ├── governance.py          ← GovernanceProposal + GovernanceVote
│   │   │   ├── data_update.py         ← Student data change requests
│   │   │   ├── metrics.py             ← Operation timing (benchmarking)
│   │   │   └── audit_log.py           ← Every auth attempt logged
│   │   ├── schemas/
│   │   │   ├── panelist.py            ← PanelistCreate/Out/Login/Token
│   │   │   ├── registration.py        ← StudentRegisterRequest, ApproveRequest, etc.
│   │   │   ├── credential.py          ← CredentialOut, DIDDocumentOut, IssuedIdentityOut
│   │   │   ├── auth.py                ← ChallengeResponse, VPVerifyRequest, AuthSuccess
│   │   │   ├── revocation.py          ← RevokeStudentRequest, AccessGrantRequest/Out
│   │   │   └── governance.py          ← ProposeRequest, VoteRequest, DataUpdateRequestIn
│   │   ├── routers/
│   │   │   ├── admin.py               ← /api/admin/* (M2 + M3 complete)
│   │   │   ├── registration.py        ← /api/register (M2 complete)
│   │   │   ├── auth.py                ← /api/auth/*
│   │   │   ├── did.py                 ← /api/did/*
│   │   │   ├── credentials.py         ← /api/credentials/*
│   │   │   ├── revocation.py          ← /api/revocation/*, /api/access/*
│   │   │   ├── governance.py          ← /api/governance/*
│   │   │   ├── data_updates.py        ← /api/student/update-request, /api/admin/pending-updates
│   │   │   └── metrics.py             ← /api/metrics/*, /api/audit/*
│   │   ├── services/
│   │   │   ├── blockchain_service.py  ← anchor_did_hash() / verify_did_hash() → Base Sepolia
│   │   │   ├── csv_service.py         ← CSV parsing, validation, bulk insert
│   │   │   ├── matching_engine.py     ← 5-field + secret_key student verification
│   │   │   ├── metrics_service.py     ← timing wrapper for all operations
│   │   │   ├── shamir_service.py      ← split/combine/hash/verify Shamir shares
│   │   │   ├── did_service.py         ← full DID + VC issuance pipeline
│   │   │   └── auth_service.py        ← 5-check VP verification, nonce, audit log
│   │   ├── services/
│   │   │   ├── blockchain_service.py  ← anchor_did_hash() / verify_did_hash() → Base Sepolia
│   │   │   ├── csv_service.py         ← CSV parsing, validation, bulk insert
│   │   │   ├── matching_engine.py     ← 5-field + secret_key student verification
│   │   │   ├── metrics_service.py     ← timing wrapper for all operations
│   │   │   ├── shamir_service.py      ← split/combine/hash/verify Shamir shares
│   │   │   ├── did_service.py         ← full DID + VC issuance pipeline (v4: encrypts VC + IPFS)
│   │   │   ├── auth_service.py        ← 5-check VP verification, nonce, audit log
│   │   │   └── ipfs_service.py        ← v4: upload_encrypted_vc() → Pinata, gateway_url()
│   │   └── utils/
│   │       ├── crypto.py              ← ECDSA P-256 key gen, sign, verify, hash_did_document
│   │       ├── hashing.py             ← bcrypt (passwords), SHA-256 (secret keys)
│   │       ├── jwt_utils.py           ← create_access_token, decode_token
│   │       └── encryption.py          ← v4: ECIES/AES-256-GCM encrypt_vc(vc_dict, pub_b64)
│   ├── alembic/
│   │   ├── env.py                     ← async-compatible Alembic env
│   │   ├── script.py.mako
│   │   └── versions/                  ← migration files go here
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx               ← Landing page (hero, features, portals)
    │   │   ├── register/page.tsx      ← Student registration form
    │   │   ├── wallet/page.tsx        ← M5: IndexedDB wallet, VP signing, tabs
    │   │   ├── admin/
    │   │   │   ├── page.tsx           ← Panelist login + 5 admin tabs
    │   │   │   └── governance/page.tsx← Governance proposals + voting
    │   │   ├── college-portal/page.tsx← DID-gated portal (attendance, events)
    │   │   ├── university-portal/page.tsx← DID-gated marks + CGPA view
    │   │   ├── attack-demo/page.tsx   ← M10: 3-tab live attack simulation
    │   │   └── analytics/page.tsx     ← M11: Recharts dashboard + audit log
    │   ├── components/
    │   │   ├── Navbar.tsx
    │   │   ├── DIDLoginButton.tsx
    │   │   ├── CredentialCard.tsx
    │   │   ├── ApprovalCard.tsx
    │   │   └── AuditLogViewer.tsx
    │   └── lib/
    │       ├── api.ts                 ← Typed fetch wrapper for all backend endpoints
    │       ├── crypto.ts              ← buildSignedVP, PKCS8 conversion, canonicalJSON
    │       └── wallet.tsx             ← WalletProvider, IndexedDB, generateClientKeys
    ├── package.json
    └── next.config.mjs
```

---

## Module Build Status

| # | Module | Status | Notes |
|---|--------|--------|-------|
| M1 | Foundation & Database | ✅ Complete | Server runs, all 12 tables migrated, /api/health live |
| M2 | CSV Upload & Registration | ✅ Complete | Panelist create/login, CSV upload, student registration, pending queue, seed data verified |
| M3 | Multisig / Shamir SSS | ✅ Complete | setup-keys, my-share, approve (3-of-5 threshold), reject, approve-batch — all tested |
| M4 | DID + VC Issuance | ✅ Complete | ECDSA P-256 key pair, W3C DID Document, W3C VC with proof, revocation index, GET /api/did/{did} + /credentials/{did} |
| M5 | Wallet (frontend) | ✅ Complete | IndexedDB key storage (v4), VP signing (Web Crypto), import/export, access grants, sessions, update request |
| M6 | Challenge-Response Auth | ✅ Complete | 5-check VP verification (nonce TTL, replay, VP sig, VC sig, revocation), JWT issued, audit log |
| M7 | Revocation Engine | ✅ Complete | T1: 2-of-5 bitstring revocation; T2: access grants with TTL; revoked creds fail auth Check 5 |
| M8 | Governance & Data Updates | ✅ Complete | Governance proposals (add/remove panelist, 3-of-5 vote, auto-execute), data update requests (3-of-5 key share approval) |
| M9 | Frontend — All Pages | ✅ Complete | 9 pages: `/`, `/register`, `/wallet`, `/admin`, `/admin/governance`, `/college-portal`, `/university-portal`, `/attack-demo`, `/analytics` |
| M10 | Attack Simulation Panel | ✅ Complete | 3-tab live simulation: fake registration, impersonation (forged VP), replay attack (nonce capture). All blocked by real backend. |
| M11 | Analytics & Charts | ✅ Complete | Raw metrics export, aggregated dashboard (op stats, auth summary, failure breakdown, system counts), auth audit log; metrics instrumented on all key ops |
| M12 | QR Cards, Export, Polish | ✅ Complete | PDF ID card with QR code, JSON credential export, session activity log, anomaly detection (multi-IP within 5min window), VC expiry check in auth flow |
| v4 | Encryption + IPFS + Security | ✅ Complete | AES-256-GCM VC encryption (ECIES), IPFS/Pinata upload (graceful fallback), IndexedDB key storage, security headers middleware |

---

## API Endpoints (25 total — stubs only until module is built)

### Admin / Registration
| Method | Path | Module | Status |
|--------|------|--------|--------|
| GET | `/api/health` | M1 | ✅ |
| POST | `/api/admin/create-panelist` | M2 | ✅ |
| POST | `/api/admin/login` | M2 | ✅ |
| GET | `/api/admin/panelists` | M2 | ✅ |
| POST | `/api/admin/upload-csv` | M2 | ✅ |
| POST | `/api/register` | M2 | ✅ |
| GET | `/api/admin/pending` | M2 | ✅ |
| POST | `/api/admin/setup-keys` | M3 | ✅ |
| GET | `/api/admin/my-share` | M3 | ✅ |
| POST | `/api/admin/approve/{id}` | M3 | ✅ |
| POST | `/api/admin/reject/{id}` | M3 | ✅ |
| POST | `/api/admin/approve-batch` | M3 | ✅ |

### DID & Credentials
| Method | Path | Module | Status |
|--------|------|--------|--------|
| GET | `/api/did/{did}` | M4 | ✅ |
| GET | `/api/credentials/{did}` | M4 | ✅ |
| GET | `/api/credentials/{did}/card` | M12 | ✅ |
| GET | `/api/credentials/{did}/export` | M12 | ✅ |

### Auth
| Method | Path | Module | Status |
|--------|------|--------|--------|
| GET | `/api/auth/challenge` | M6 | ✅ |
| POST | `/api/auth/verify` | M6 | ✅ |
| GET | `/api/auth/sessions/{did}` | M12 | ✅ |

### Revocation & Access
| Method | Path | Module | Status |
|--------|------|--------|--------|
| POST | `/api/revocation/revoke-student` | M7 | ✅ |
| POST | `/api/access/grant` | M7 | ✅ |
| POST | `/api/access/revoke/{id}` | M7 | ✅ |
| GET | `/api/access/active/{did}` | M7 | ✅ |
| GET | `/api/revocation/status/{id}` | M7 | ✅ |

### Governance
| Method | Path | Module | Status |
|--------|------|--------|--------|
| POST | `/api/governance/propose` | M8 | ✅ |
| POST | `/api/governance/vote/{id}` | M8 | ✅ |
| GET | `/api/governance/proposals` | M8 | ✅ |

### Data Updates
| Method | Path | Module | Status |
|--------|------|--------|--------|
| POST | `/api/student/update-request` | M8 | ✅ |
| GET | `/api/admin/pending-updates` | M8 | ✅ |
| POST | `/api/admin/approve-update/{id}` | M8 | ✅ |

### Metrics & Audit
| Method | Path | Module | Status |
|--------|------|--------|--------|
| GET | `/api/metrics/export` | M11 | ✅ |
| GET | `/api/metrics/dashboard` | M11 | ✅ |
| GET | `/api/audit/logs` | M11 | ✅ |

---

## Key Design Decisions

- **Generic error messages**: Registration and auth failures always return the same message to prevent enumeration attacks.
- **Server-side key generation (demo mode)**: Private keys generated server-side for demo simplicity. Production would use client-side Web Crypto API only.
- **Revocation bitstring**: Stored as 512 hex chars (= 2048 bits) in Postgres `TEXT`. Index 0 = not revoked, 1 = revoked. O(1) lookup.
- **Shamir shares**: Actual shares are not stored in the DB — only their hashes (for verification). Shares are delivered once to each panelist via a secure download endpoint.
- **Blockchain anchoring**: Non-blocking. If Base Sepolia call fails (gas, RPC down), DID issuance still completes. The `blockchain_hash` field on `did_documents` will be NULL until anchored.
- **JWT sessions**: Issued after successful 5-check VP verification. Expire in 60 min by default.
- **VC expiry**: Auth flow checks `expirationDate` in the VC (after Check 4 sig verification). Expired VC fails with generic 401.
- **Anomaly detection (M12)**: After successful auth, queries `auth_audit_log` for same DID + different IP within `ANOMALY_WINDOW_SECONDS`. Sets `is_anomaly=True` on the audit entry; returns `is_suspicious=True` in auth response.
- **PDF ID cards (M12)**: ReportLab + qrcode. Card includes student info, DID string, QR code. Returns as `StreamingResponse` with `application/pdf` content type.
- **Metrics instrumentation (M11)**: All critical operations wrapped with `metrics_service.record()` → `challenge_gen`, `vp_verify`, `did_creation`, `batch_approval`, `revocation`, `csv_upload`, `csv_match`.
- **v4 VC Encryption (ECIES)**: `utils/encryption.py` — ECDH ephemeral key + HKDF-SHA256 + AES-256-GCM. `encrypt_vc(vc_dict, pub_b64)` returns JSON payload stored in `credentials.encrypted_vc`. Decryption is client-side only (private key never leaves browser).
- **v4 IPFS storage**: `services/ipfs_service.py` — `upload_encrypted_vc()` pins to Pinata, returns CID stored in `credentials.vc_cid`. Gracefully skipped if `PINATA_API_KEY` not set.
- **v4 Security headers**: FastAPI middleware injects `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` on every response.
- **v4 Alembic migrations**: `cc8cbf069bf5` (is_anomaly on audit_log), `aa2520fc1c68` (encrypted_vc + vc_cid on credentials, vc_json now nullable).
- **VP signing crypto (M5)**: Python `ecdsa.sign_deterministic` hashes internally → backend verifies `sha256(sha256(canonical))`. JS: pre-hash once, pass to `crypto.subtle.sign({hash:"SHA-256"})` which hashes again → same double-hash. Raw 32-byte P-256 key wrapped in minimal 67-byte PKCS8 DER for Web Crypto `importKey`.

---

## DIDRegistry Solidity Contract (deploy to Base Sepolia)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DIDRegistry {
    mapping(string => string) private _hashes;
    event DIDAnchored(string indexed did, string hash);

    function anchorDID(string calldata did, string calldata hash) external {
        _hashes[did] = hash;
        emit DIDAnchored(did, hash);
    }

    function getHash(string calldata did) external view returns (string memory) {
        return _hashes[did];
    }
}
```

Deploy with Remix or Hardhat targeting Base Sepolia. Copy the contract address to `.env`.
