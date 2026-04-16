# SecureDID v3 — Complete Project Guide & Modular Breakdown

> **Decentralized Identity for Educational Institutions**
> Jay Rane • Don Bosco College of Engineering, Goa • April 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Concepts & Standards](#2-core-concepts--standards)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Module Breakdown](#5-module-breakdown)
   - Module 1: Project Foundation & Database
   - Module 2: CSV Upload & Student Registration
   - Module 3: Multisig Panelist System (Shamir's Secret Sharing)
   - Module 4: DID Creation & Verifiable Credential Issuance
   - Module 5: Wallet (Browser-Based Key Management)
   - Module 6: Challenge-Response Authentication
   - Module 7: Revocation Engine (3 Types)
   - Module 8: Governance & Data Updates
   - Module 9: Frontend — All Pages
   - Module 10: Attack Simulation Panel
   - Module 11: Analytics, Benchmarking & Charts
   - Module 12: QR Code ID Cards, Export & Polish
6. [Database Schema Reference](#6-database-schema-reference)
7. [API Endpoint Reference](#7-api-endpoint-reference)
8. [Frontend Pages Reference](#8-frontend-pages-reference)
9. [Security Model](#9-security-model)
10. [Folder Structure](#10-folder-structure)
11. [Deployment & Demo Strategy](#11-deployment--demo-strategy)

---

## 1. Project Overview

SecureDID is a **decentralized identity (DID) platform** built for educational institutions. It replaces traditional username/password authentication with **blockchain-anchored, wallet-based identity** using W3C standards.

### What It Does

- College admin panelists (department heads) collectively issue student digital IDs using a **multisig (3-of-5) mechanism**
- Students authenticate to college/university portals with a **single wallet click** — no passwords
- The system demonstrates **real attack scenarios** (fake registration, impersonation, replay attacks) and shows how each is blocked
- Students control their own identity — they can grant/revoke access to third parties with time limits
- Compromised admins can be voted out by remaining panelists (governance)

### 6 Major Subsystems

| # | Subsystem | Purpose |
|---|-----------|---------|
| 1 | Admin Multisig Panel | 5 panelists collectively manage student ID issuance (3/5 threshold) |
| 2 | Student Registration & ID Claiming | Students register with college credentials, verified against CSV data |
| 3 | Wallet-Based Authentication | One-click DID login replacing Google/email auth |
| 4 | Dual Portal Demo | Two dummy portals (College + University) proving cross-service portability |
| 5 | Attack Prevention & Simulation | Live demos of 3 attack types being blocked |
| 6 | Revocation & Access Control | College revokes IDs, students revoke third-party access, admin removal |

### Actors

| Actor | Count | Role |
|-------|-------|------|
| Super Admin | 1 | Initial setup, creates panelist accounts, uploads config |
| Admin Panelists | 5 | Department heads (CS, IT, EC, ME, Civil). Each holds a Shamir key share. 3/5 must agree to issue IDs |
| Students | Many | Register → claim DID → use wallet for auth → manage permissions |
| College Portal | 1 (dummy) | Attendance, events, notices. Accepts DID wallet login |
| University Portal | 1 (dummy) | Marks, marksheets, CGPA. Accepts DID wallet login |
| Attacker | 1 (demo) | Tries fake registration, impersonation, and replay attacks |

---

## 2. Core Concepts & Standards

### W3C Decentralized Identifiers (DIDs)

A DID is a globally unique identifier that the owner controls — no central authority needed. Format: `did:securedid:<hex>`

A DID resolves to a **DID Document** (JSON) containing: the DID itself, the public key(s), authentication methods, and service endpoints.

### W3C Verifiable Credentials (VCs)

A VC is a digitally signed claim about a subject. In SecureDID, the VC contains: student's DID, name, roll number, department, year, photo hash, issuance/expiry dates, and revocation index. The issuer signature is produced by combining panelist key shares (multisig).

### Verifiable Presentations (VPs)

When a student logs in, they wrap their VC inside a VP that also includes: the challenge nonce (from the portal), the portal's domain, a timestamp, and the student's signature. This proves the student holds the private key for that DID.

### Shamir's Secret Sharing (SSS)

The master issuer private key is split into 5 shares using SSS. Any 3 shares can reconstruct the key (via Lagrange interpolation) to sign credentials. No single panelist can sign alone. If a panelist is compromised, they can be voted out and shares reshared.

### Revocation Bitstring

A bit array (2048 bits). Each credential is assigned an index. Bit = 0 means valid, bit = 1 means revoked. Checking revocation is a single bit lookup — O(1).

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                 │
│  Landing │ Register │ Wallet │ Admin │ Governance        │
│  College Portal │ University Portal │ Attack Demo        │
│  Analytics Dashboard                                     │
│  Web Crypto API for client-side key management           │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (JSON)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  BACKEND (FastAPI)                        │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Registration  │  │    Auth      │  │  Revocation   │  │
│  │  & Issuance   │  │   Engine     │  │   Engine      │  │
│  │  Service      │  │  (5-check)   │  │  (3 types)    │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Multisig     │  │ Governance   │  │  Metrics &    │  │
│  │  (Shamir SSS) │  │  Service     │  │  Audit Log    │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌───────────┐ ┌──────────┐ ┌──────────────┐
   │ PostgreSQL │ │  Local   │ │  Blockchain  │
   │  (11 tables)│ │  Crypto  │ │  (Hash       │
   │            │ │  Engine  │ │   Anchoring) │
   └───────────┘ └──────────┘ └──────────────┘
```

### Data Flow Summary

1. **Setup**: Super Admin → creates panelists → each uploads student CSV
2. **Registration**: Student submits credentials → matched against CSV → enters approval queue
3. **Issuance**: 3/5 panelists approve → Shamir key shares combined → VC signed → DID + VC delivered to student wallet
4. **Auth**: Student visits portal → portal gets nonce → student signs VP in wallet → backend runs 5 checks → JWT issued
5. **Revocation**: Admin revokes (bitstring flip) OR student revokes third-party access (TTL/manual)

---

## 4. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 + Tailwind CSS | App router, server components, fast dev |
| Client Crypto | Web Crypto API | ECDSA P-256 key generation & signing in browser — keys never leave device |
| Backend | FastAPI (Python) | Async, auto-docs (Swagger), Pydantic validation, fast |
| Database | PostgreSQL | JSONB for DID Documents & VCs, robust, production-grade |
| ORM | SQLAlchemy (async) | Type-safe queries, migrations via Alembic |
| Crypto | `ecdsa` + `pyshamir` (Python) | ECDSA P-256 key pairs, Shamir's Secret Sharing |
| Blockchain | Local Ganache / Hardhat (optional) | Hash anchoring for DID Documents. Can be simulated with a hash store table |
| Charts | Recharts (frontend) or Matplotlib (export) | Benchmarking visualizations |
| PDF | ReportLab | QR Code ID card generation |
| QR | `qrcode` (Python) | Encode DIDs into scannable QR codes |

---

## 5. Module Breakdown

Each module is a self-contained unit. Build them in order — each depends on the previous ones.

---

### Module 1: Project Foundation & Database

**Goal**: Set up the project structure, database, and core configuration.

**What to build**:
- FastAPI project scaffold with proper folder structure
- PostgreSQL database connection with SQLAlchemy async engine
- All 11 database tables as SQLAlchemy models
- Alembic migration setup
- Pydantic schemas for every entity (request/response models)
- CORS middleware configuration
- Health check endpoint (`GET /api/health`)
- Environment configuration (`.env` + `pydantic-settings`)
- Database connection pooling

**Database tables created in this module**:
- `panelists`
- `csv_records`
- `registration_requests`
- `did_documents`
- `credentials`
- `nonce_store`
- `revocation_registry`
- `access_grants`
- `governance_proposals`
- `data_update_requests`
- `metrics`
- `auth_audit_log`

**Key files**:
```
backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, lifespan
│   ├── config.py            # Settings from .env
│   ├── database.py          # Async engine, session factory
│   ├── models/
│   │   ├── __init__.py
│   │   ├── panelist.py
│   │   ├── csv_record.py
│   │   ├── registration.py
│   │   ├── did_document.py
│   │   ├── credential.py
│   │   ├── nonce.py
│   │   ├── revocation.py
│   │   ├── access_grant.py
│   │   ├── governance.py
│   │   ├── data_update.py
│   │   ├── metrics.py
│   │   └── audit_log.py
│   └── schemas/
│       ├── __init__.py
│       ├── panelist.py
│       ├── registration.py
│       ├── credential.py
│       ├── auth.py
│       └── governance.py
├── alembic/
│   └── versions/
├── alembic.ini
├── requirements.txt
└── .env
```

**Endpoints**: `GET /api/health`

**Deliverable**: Running FastAPI server with all tables created, Swagger docs accessible at `/docs`.

**Estimated time**: 1 day

---

### Module 2: CSV Upload & Student Registration

**Goal**: Panelists upload authorized student lists. Students register and get matched against CSV data.

**What to build**:
- CSV upload endpoint — panelist uploads file, system parses and stores each row in `csv_records`
- CSV validation: required columns check, duplicate detection, conflict flagging across panelist uploads
- Student registration endpoint: accepts email, roll number, DOB, department, year, secret key
- 5-field matching engine: checks ALL fields against `csv_records` — ALL must match
- Generic error responses (no hints about which field failed — prevents enumeration attacks)
- Registration request queue: matched students enter "pending approval" status
- Secret key hashing (bcrypt or SHA-256 before storage)

**Key logic**:
```python
# Matching engine pseudocode
def verify_registration(student_input):
    record = db.query(csv_records).filter_by(
        email=student_input.email,
        roll_number=student_input.roll_number,
        dob=student_input.dob,
        department=student_input.department
    ).first()

    if not record:
        raise HTTPException(400, "Registration failed")  # Generic!

    if not verify_hash(student_input.secret_key, record.secret_key_hash):
        raise HTTPException(400, "Registration failed")  # Same generic error

    # All 5 matched → create pending registration
    create_registration_request(student_input, csv_match=True)
```

**Endpoints**:
- `POST /api/admin/upload-csv`
- `POST /api/register`
- `GET /api/admin/pending`

**Depends on**: Module 1

**Deliverable**: Panelist can upload CSV, student can register, matched requests appear in pending queue.

**Estimated time**: 1 day

---

### Module 3: Multisig Panelist System (Shamir's Secret Sharing)

**Goal**: Implement the 3-of-5 threshold signing mechanism for credential issuance.

**What to build**:
- Master key generation: ECDSA P-256 key pair for the institution
- Shamir's Secret Sharing: split master private key into 5 shares (threshold = 3)
- Key share distribution: each panelist receives their share (stored as hash in DB, actual share delivered once via secure download)
- Panelist authentication: email + key share verification
- Approval flow: each panelist submits their key share when approving a registration
- Threshold reconstruction: when 3 shares collected, reconstruct master private key via Lagrange interpolation
- Combined signature generation: sign the VC with the reconstructed key
- Batch approval: approve all CSV-matched registrations at once (for 600+ students)
- Key share validation without exposing shares

**Key crypto operations**:
```python
# Shamir's Secret Sharing
from pyshamir import split, combine

# Split master key into 5 shares, threshold 3
shares = split(master_private_key_bytes, 5, 3)

# When 3 panelists approve, combine their shares
combined_key = combine(collected_shares)  # Lagrange interpolation

# Sign credential with combined key
from ecdsa import SigningKey, NIST256p
sk = SigningKey.from_string(combined_key, curve=NIST256p)
signature = sk.sign(credential_hash)
```

**Endpoints**:
- `POST /api/admin/approve/{request_id}` (submits key share)
- `POST /api/admin/reject/{request_id}`
- `POST /api/admin/approve-batch`

**Depends on**: Module 1, Module 2

**Deliverable**: 3 panelists can approve a registration, their shares combine to produce a valid signature.

**Estimated time**: 1.5 days

---

### Module 4: DID Creation & Verifiable Credential Issuance

**Goal**: Generate DIDs and W3C-compliant Verifiable Credentials for approved students.

**What to build**:
- ECDSA P-256 key pair generation for each student
- DID creation: `did:securedid:<hex>` format
- W3C DID Document construction (JSON-LD):
  ```json
  {
    "@context": "https://www.w3.org/ns/did/v1",
    "id": "did:securedid:abc123...",
    "authentication": [{
      "id": "did:securedid:abc123...#key-1",
      "type": "EcdsaSecp256r1VerificationKey2019",
      "controller": "did:securedid:abc123...",
      "publicKeyBase64": "..."
    }]
  }
  ```
- Blockchain hash anchoring: hash the DID Document and store on-chain (or simulated hash store)
- W3C Verifiable Credential construction:
  ```json
  {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential", "StudentCredential"],
    "issuer": "did:securedid:college-issuer",
    "issuanceDate": "2026-04-15T00:00:00Z",
    "expirationDate": "2027-04-15T00:00:00Z",
    "credentialSubject": {
      "id": "did:securedid:abc123...",
      "name": "Student Name",
      "rollNumber": "21CE001",
      "department": "CS",
      "year": 4,
      "photoHash": "sha256:..."
    },
    "credentialStatus": {
      "type": "BitstringStatusListEntry",
      "statusListIndex": 42
    },
    "proof": {
      "type": "EcdsaSecp256r1Signature2019",
      "created": "...",
      "proofValue": "..."
    }
  }
  ```
- Revocation index assignment from bitstring registry
- Credential delivery: return DID + VC + private key to student (private key generated client-side in production, server-side for demo simplicity)

**Endpoints**:
- `GET /api/did/{did}` (resolve DID to DID Document)
- `GET /api/credentials/{did}` (get credentials for a DID)

**Depends on**: Module 1, Module 2, Module 3

**Deliverable**: Approved student gets a valid DID + signed VC with all required fields.

**Estimated time**: 1.5 days

---

### Module 5: Wallet (Browser-Based Key Management)

**Goal**: Build the client-side wallet that stores the student's private key and handles signing.

**What to build**:
- Key storage in browser: `localStorage` for demo, `IndexedDB` (encrypted) for better security
- Wallet state management: stores DID, VC, private key, active sessions
- VP (Verifiable Presentation) construction:
  - Wrap VC + challenge nonce + portal domain + timestamp
  - Sign with student's private key using Web Crypto API
- One-click login flow:
  1. User clicks "Login with SecureDID"
  2. Portal requests nonce from backend
  3. Wallet constructs VP with nonce
  4. Wallet signs VP
  5. VP sent to portal's verify endpoint
- Private key backup/export option
- Active permissions list (third-party access grants)
- Session activity view

**Key frontend crypto**:
```javascript
// Web Crypto API — sign VP
const key = await crypto.subtle.importKey(
  "pkcs8", privateKeyBuffer,
  { name: "ECDSA", namedCurve: "P-256" },
  false, ["sign"]
);

const vpBytes = new TextEncoder().encode(JSON.stringify(vp));
const signature = await crypto.subtle.sign(
  { name: "ECDSA", hash: "SHA-256" },
  key, vpBytes
);
```

**Frontend page**: `/wallet`

**Depends on**: Module 4

**Deliverable**: Student can see their DID/VC in the wallet and sign VPs for authentication.

**Estimated time**: 1.5 days

---

### Module 6: Challenge-Response Authentication

**Goal**: Implement the full nonce-based auth pipeline that portals use to verify students.

**What to build**:
- Nonce generation: 32-char hex, 30-second TTL, bound to requesting portal's domain
- Nonce store: tracks creation time, expiry, usage status, consuming DID
- **5-check verification pipeline** (each check timed for benchmarking):

| Check | What | Blocks |
|-------|------|--------|
| 1 | Is the nonce in the store and not expired? | Expired replays |
| 2 | Has this nonce been used before? | Same-session replays |
| 3 | Does the VP signature verify against the student's public key? | Impersonation (no private key) |
| 4 | Does the embedded VC signature verify against the issuer's combined public key? | Forged credentials |
| 5 | Is the credential revoked (bitstring check)? | Revoked students |

- JWT session token issuance on success
- Audit logging: every attempt logged with result, failure check, IP, timestamp
- Detailed rejection reasons in audit log, generic "Authentication failed" to user

**Endpoints**:
- `GET /api/auth/challenge?domain=X`
- `POST /api/auth/verify`

**Depends on**: Module 1, Module 4, Module 5

**Deliverable**: Full auth flow works — student clicks login, signs VP, backend verifies, JWT issued.

**Estimated time**: 1.5 days

---

### Module 7: Revocation Engine (3 Types)

**Goal**: Implement all three revocation mechanisms.

**What to build**:

#### Type 1: College Revokes Student ID
- Admin initiates revocation on a student
- Requires 2/5 panelist confirmation (prevents rogue mass-revocation)
- Backend flips bit in revocation bitstring (index 0→1)
- Student's next auth attempt fails at Check 5
- Both portals reject the student

#### Type 2: Student Revokes Third-Party Access
- When granting access, student sets a TTL (e.g., "share with InternPortal for 2 hours")
- `access_grants` table tracks: platform, domain, grant time, expiry, revocation status
- Auto-expiry: after TTL, verification requests from that platform are rejected
- Manual revoke: student clicks "Revoke" in wallet → immediate invalidation
- Active permissions page shows all grants with status

#### Type 3: Admin Panelist Removal (Compromised Admin)
- Any panelist proposes removal of another panelist
- 3 of remaining 4 must vote YES
- If passed: compromised panelist's key share invalidated
- New key share set generated (now 4 panelists, threshold = 3/4)
- Existing student credentials remain valid
- New panelist can be added via same voting mechanism

**Endpoints**:
- `POST /api/revocation/revoke-student`
- `POST /api/access/grant`
- `POST /api/access/revoke/{grant_id}`
- `GET /api/access/active/{did}`
- `GET /api/revocation/status/{cred_id}`

**Depends on**: Module 1, Module 3, Module 4, Module 6

**Deliverable**: All three revocation types work. Revoked students can't login. Students can manage third-party permissions.

**Estimated time**: 1.5 days

---

### Module 8: Governance & Data Updates

**Goal**: Panelist governance (add/remove members) and student data update workflow.

**What to build**:

#### Governance
- Proposal creation: any panelist can propose adding/removing a member
- Voting: each panelist votes YES/NO within a 24-hour window
- Proposal resolution: if threshold met → execute (remove panelist, invalidate share, reshare keys)
- Key resharing after panelist change: generate new Shamir shares for the new set of panelists
- Proposal history and audit trail

#### Data Updates
- Student submits update request (e.g., change phone number, address)
- Request enters panelist queue
- 3/5 panelists must approve the change
- If the change affects the VC (e.g., department transfer), a new VC is issued and the old one is revoked
- Student's wallet reflects updated data

**Endpoints**:
- `POST /api/governance/propose`
- `POST /api/governance/vote/{proposal_id}`
- `GET /api/governance/proposals`
- `POST /api/student/update-request`
- `GET /api/admin/pending-updates`
- `POST /api/admin/approve-update/{id}`

**Depends on**: Module 1, Module 3

**Deliverable**: Panelists can vote on governance proposals. Students can request and receive data updates.

**Estimated time**: 1 day

---

### Module 9: Frontend — All Pages

**Goal**: Build all 9 frontend pages with Next.js 14 + Tailwind CSS.

**Pages to build**:

| # | Route | Key Components |
|---|-------|---------------|
| 1 | `/` (Landing) | Project intro, how-it-works flow, links to all portals, tech stack badges |
| 2 | `/register` | Registration form (6 fields), live validation, status display after submission |
| 3 | `/wallet` | DID card display, VC viewer, private key backup, active permissions with revoke buttons, data update form, session activity log |
| 4 | `/admin` | CSV upload (drag-drop), pending registrations table with approve/reject, pending data updates, revocation controls, analytics summary |
| 5 | `/admin/governance` | Propose removal/addition form, active proposals with vote buttons, key reshare status, proposal history |
| 6 | `/college-portal` | "Login with SecureDID" button, student dashboard (attendance, events, notices — dummy data), ID card download |
| 7 | `/university-portal` | "Login with SecureDID" button, semester marks, marksheet download, CGPA chart (dummy data) |
| 8 | `/attack-demo` | Split-screen (legit user left, attacker right), 3 attack tabs, live audit log at bottom, color-coded results |
| 9 | `/analytics` | 10 benchmark charts, real-time metrics, auth success/failure rates, revocation timeline |

**Shared components**:
- `DIDLoginButton` — reusable "Login with SecureDID" component
- `WalletProvider` — React context for wallet state
- `AuditLogViewer` — real-time log display with color coding
- `ApprovalCard` — panelist approval UI with key share input
- `CredentialCard` — visual display of a VC

**Depends on**: All backend modules (1–8)

**Deliverable**: All 9 pages functional, responsive, connected to backend APIs.

**Estimated time**: 3 days

---

### Module 10: Attack Simulation Panel

**Goal**: Build the interactive attack demo that proves SecureDID's security.

**What to build**:

#### Tab 1: Fake Registration Attack
- Attacker fills registration form with fake data
- System rejects: CSV matching fails
- Even if somehow submitted, panelists see and reject
- Show: failed attempt in red in audit log, panelist rejection in admin dashboard

#### Tab 2: Impersonation Attack
- Attacker knows a student's email, roll number, maybe even DID string
- Attacker tries to login on College Portal
- Without the student's private key, VP signature is invalid
- Show: Check 3 failure — "Invalid VP signature"

#### Tab 3: Replay Attack (3 variations)
- **Immediate replay**: Capture legitimate VP → replay → Check 2 fails (nonce already used)
- **Delayed replay (31s)**: Wait → replay → Check 1 fails (nonce expired)
- **Modified nonce**: Change nonce in VP → Check 3 fails (signature invalid)
- Show: all three variations failing with different error codes, color-coded

**UI Layout**:
```
┌──────────────────────┬──────────────────────┐
│   LEGITIMATE USER    │     ATTACKER         │
│                      │                      │
│  [Normal auth flow]  │  [Attack controls]   │
│  [Success ✓]         │  [Failure ✗]         │
└──────────────────────┴──────────────────────┘
┌─────────────────────────────────────────────┐
│          LIVE AUDIT LOG                      │
│  ✓ Student auth success  |  Check 1: ✓ ...  │
│  ✗ Attacker blocked      |  Check 3: ✗ ...  │
└─────────────────────────────────────────────┘
```

**Depends on**: Module 6, Module 9

**Deliverable**: Interactive split-screen demo showing all 3 attacks being blocked in real-time.

**Estimated time**: 1.5 days

---

### Module 11: Analytics, Benchmarking & Charts

**Goal**: Instrument the system, collect metrics, and display 10+ charts.

**What to build**:

#### Metrics Collection
- Wrap every critical operation with timing:
  ```python
  async def record_metric(operation: str, func, **metadata):
      start = time.perf_counter()
      result = await func()
      duration = (time.perf_counter() - start) * 1000
      await db.execute(insert(Metrics).values(
          operation=operation,
          duration_ms=duration,
          result="SUCCESS" if result else "FAILURE",
          metadata=metadata
      ))
      return result
  ```

#### 10 Charts

| # | Chart | Type | Data Source |
|---|-------|------|-------------|
| 1 | DID Creation Time | Bar | `metrics` where operation = `did_creation` |
| 2 | CSV Matching Speed (per student) | Line | `metrics` where operation = `csv_match` |
| 3 | Batch Approval Time vs Batch Size | Scatter | `metrics` where operation = `batch_approval` |
| 4 | VC Issuance Time | Bar | `metrics` where operation = `vc_issuance` |
| 5 | Threshold Signing Time (3/5 vs 4/5) | Grouped Bar | `metrics` where operation = `threshold_sign` |
| 6 | Challenge-Response Latency | Line | `metrics` where operation = `challenge_gen` + `vp_verify` |
| 7 | 5-Check Verification Breakdown | Stacked Bar | `metrics` where operation = `check_1` through `check_5` |
| 8 | Auth Success vs Failure Rate | Pie/Donut | `auth_audit_log` grouped by result |
| 9 | Revocation Speed | Bar | `metrics` where operation = `revocation` |
| 10 | Attack Detection Rate | Grouped Bar | `auth_audit_log` grouped by attack type |

**Endpoints**:
- `GET /api/metrics/export`
- `GET /api/metrics/dashboard`
- `GET /api/audit/logs`

**Depends on**: All backend modules

**Deliverable**: Analytics page with 10 interactive charts, exportable metrics data.

**Estimated time**: 1.5 days

---

### Module 12: QR Code ID Cards, Export & Polish

**Goal**: Final features that strengthen the project for presentation and publication.

**What to build**:

#### QR Code ID Card (PDF)
- When a student's DID is issued, generate a downloadable PDF ID card
- Card contains: student photo placeholder, name, roll number, department, year, DID string, and a QR code encoding the DID
- Scanning the QR on a verifier's device initiates the challenge-response auth flow
- Built with ReportLab + `qrcode` library

#### Credential Export
- Students can export their DID Document and VCs as JSON files
- Ensures portability — if SecureDID goes offline, identity data isn't lost
- Addresses the portability concern from academic literature

#### Session Activity Dashboard
- Students see every login session: portal, time, IP, success/failure
- Transparency over identity usage — core SSI principle

#### Anomaly Detection
- If the same DID authenticates from two different IPs within 5 minutes → flag as suspicious
- Alert in student's wallet and admin dashboard
- Addresses the key compromise threat

#### Credential Expiry & Auto-Renewal
- Credentials expire after 1 year (academic year)
- Notification before expiry
- Renewal requires panelist re-approval (prevents dropped-out students from auto-renewing)

#### Final Polish
- Seed data script: 5 panelists, 20 students, sample credentials
- Docker Compose for one-command deployment
- README with setup instructions
- Demo script (timed, 3 minutes)

**Depends on**: All modules

**Deliverable**: Complete, polished, demo-ready system.

**Estimated time**: 2 days

---

## 6. Database Schema Reference

### All 12 Tables

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `panelists` | 5 admin panelists | panelist_id, name, email, department, key_share_hash, is_active |
| `csv_records` | Authorized student data from CSV | email, roll_number, dob, department, year, secret_key (hashed), uploaded_by |
| `registration_requests` | Student registration queue | email, roll_number, csv_match, status (pending/approved/rejected), approvals count |
| `did_documents` | DID → DID Document mapping | did (PK), public_key, did_document (JSONB), blockchain_hash, is_active |
| `credentials` | Signed W3C Verifiable Credentials | credential_id, holder_did, vc_json (JSONB), revocation_index, is_revoked |
| `nonce_store` | Challenge nonces for auth | nonce (PK), domain, expires_at (created_at + 30s), is_used, used_by_did |
| `revocation_registry` | Bitstring for credential revocation | registry_id, bitstring (BIT VARYING, 2048 bits), last_updated |
| `access_grants` | Third-party permissions | student_did, platform_name, platform_domain, expires_at, is_revoked |
| `governance_proposals` | Panelist add/remove proposals | type, target_panelist_id, proposed_by, votes_yes, votes_no, status, expires_at |
| `data_update_requests` | Student data change requests | student_did, field_name, old_value, new_value, approvals, status |
| `metrics` | Performance benchmarking | operation, duration_ms, result (SUCCESS/FAILURE), metadata (JSONB) |
| `auth_audit_log` | Authentication attempt log | did_attempted, portal, nonce_used, result, failure_check, ip_address |

---

## 7. API Endpoint Reference

### Registration & Issuance (6 endpoints)
| Method | Endpoint | Module |
|--------|----------|--------|
| POST | `/api/admin/upload-csv` | M2 |
| POST | `/api/register` | M2 |
| GET | `/api/admin/pending` | M2 |
| POST | `/api/admin/approve/{request_id}` | M3 |
| POST | `/api/admin/reject/{request_id}` | M3 |
| POST | `/api/admin/approve-batch` | M3 |

### DID & Credentials (2 endpoints)
| Method | Endpoint | Module |
|--------|----------|--------|
| GET | `/api/did/{did}` | M4 |
| GET | `/api/credentials/{did}` | M4 |

### Authentication (2 endpoints)
| Method | Endpoint | Module |
|--------|----------|--------|
| GET | `/api/auth/challenge?domain=X` | M6 |
| POST | `/api/auth/verify` | M6 |

### Revocation & Access Control (5 endpoints)
| Method | Endpoint | Module |
|--------|----------|--------|
| POST | `/api/revocation/revoke-student` | M7 |
| POST | `/api/access/grant` | M7 |
| POST | `/api/access/revoke/{grant_id}` | M7 |
| GET | `/api/access/active/{did}` | M7 |
| GET | `/api/revocation/status/{cred_id}` | M7 |

### Governance (3 endpoints)
| Method | Endpoint | Module |
|--------|----------|--------|
| POST | `/api/governance/propose` | M8 |
| POST | `/api/governance/vote/{proposal_id}` | M8 |
| GET | `/api/governance/proposals` | M8 |

### Data Updates (3 endpoints)
| Method | Endpoint | Module |
|--------|----------|--------|
| POST | `/api/student/update-request` | M8 |
| GET | `/api/admin/pending-updates` | M8 |
| POST | `/api/admin/approve-update/{id}` | M8 |

### Metrics & Analytics (3 endpoints)
| Method | Endpoint | Module |
|--------|----------|--------|
| GET | `/api/metrics/export` | M11 |
| GET | `/api/metrics/dashboard` | M11 |
| GET | `/api/audit/logs` | M11 |

**Total: 25 endpoints**

---

## 8. Frontend Pages Reference

| # | Route | Description | Key Module Dependency |
|---|-------|-------------|----------------------|
| 1 | `/` | Landing page | — |
| 2 | `/register` | Student registration form | M2 |
| 3 | `/wallet` | DID wallet, VC viewer, permissions, data updates | M4, M5, M7 |
| 4 | `/admin` | Panelist dashboard (CSV, approvals, revocation) | M2, M3, M7 |
| 5 | `/admin/governance` | Governance proposals, voting, key reshare | M8 |
| 6 | `/college-portal` | Dummy portal — attendance, events | M6 |
| 7 | `/university-portal` | Dummy portal — marks, marksheets | M6 |
| 8 | `/attack-demo` | Split-screen attack simulation | M6, M10 |
| 9 | `/analytics` | 10 benchmark charts, metrics | M11 |

---

## 9. Security Model

### Threats Addressed

| Threat | Defense | How It's Demonstrated |
|--------|---------|----------------------|
| Fake identity creation | CSV matching + multisig approval | Attack Demo Tab 1 |
| Credential theft / impersonation | Private key never leaves device + VP signature check | Attack Demo Tab 2 |
| Replay attacks | Time-limited nonces (30s) + single-use enforcement | Attack Demo Tab 3 |
| Rogue admin | Multisig threshold — no single admin can issue IDs | Governance panel |
| Compromised admin | Panelist removal voting + key resharing | Governance flow |
| Mass revocation abuse | Revocation requires 2/5 panelist confirmation | Revocation Type 1 |
| Over-sharing credentials | Time-limited access grants + manual revoke | Revocation Type 2 |
| Key compromise detection | Anomaly detection (multi-IP in 5 min) | Wallet alerts |
| Credential expiry bypass | 1-year expiry + panelist-approved renewal | Auto-renewal flow |
| Data loss / vendor lock-in | JSON export of DID Document + VCs | Export feature |

### Crypto Primitives Used

| Primitive | Usage | Library |
|-----------|-------|---------|
| ECDSA P-256 | Student key pairs, VP signing, VC signing | Web Crypto API (frontend), `ecdsa` (backend) |
| Shamir's Secret Sharing | Master key split into 5 shares, threshold 3 | `pyshamir` |
| Lagrange Interpolation | Reconstruct master key from 3+ shares | Built into `pyshamir` |
| SHA-256 | Hashing DID Documents for blockchain anchoring, secret key hashing | `hashlib` |
| Bitstring Status List | O(1) credential revocation check | Custom implementation |

---

## 10. Folder Structure

```
securedid/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── panelist.py
│   │   │   ├── csv_record.py
│   │   │   ├── registration.py
│   │   │   ├── did_document.py
│   │   │   ├── credential.py
│   │   │   ├── nonce.py
│   │   │   ├── revocation.py
│   │   │   ├── access_grant.py
│   │   │   ├── governance.py
│   │   │   ├── data_update.py
│   │   │   ├── metrics.py
│   │   │   └── audit_log.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── panelist.py
│   │   │   ├── registration.py
│   │   │   ├── credential.py
│   │   │   ├── auth.py
│   │   │   ├── revocation.py
│   │   │   └── governance.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── admin.py          # CSV upload, pending, approve/reject
│   │   │   ├── registration.py   # Student registration
│   │   │   ├── auth.py           # Challenge + verify
│   │   │   ├── did.py            # DID resolution
│   │   │   ├── credentials.py    # Credential endpoints
│   │   │   ├── revocation.py     # Revocation + access control
│   │   │   ├── governance.py     # Proposals + voting
│   │   │   ├── data_updates.py   # Student data changes
│   │   │   └── metrics.py        # Analytics + audit logs
│   │   ├── services/
│   │   │   ├── csv_service.py        # CSV parsing + validation
│   │   │   ├── matching_engine.py    # 5-field student verification
│   │   │   ├── shamir_service.py     # Key splitting + reconstruction
│   │   │   ├── did_service.py        # DID + DID Document creation
│   │   │   ├── credential_service.py # VC creation + signing
│   │   │   ├── auth_service.py       # Nonce gen + 5-check pipeline
│   │   │   ├── revocation_service.py # Bitstring + access grants
│   │   │   ├── governance_service.py # Proposals + voting + reshare
│   │   │   ├── metrics_service.py    # Timing wrapper + recording
│   │   │   ├── qr_service.py         # QR code + ID card PDF
│   │   │   └── anomaly_service.py    # Multi-IP detection
│   │   └── utils/
│   │       ├── crypto.py         # ECDSA helpers
│   │       ├── hashing.py        # SHA-256, bcrypt
│   │       └── jwt_utils.py      # JWT creation + validation
│   ├── alembic/
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── seed_data.py              # 5 panelists, 20 students
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing
│   │   │   ├── register/page.tsx
│   │   │   ├── wallet/page.tsx
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx          # Admin dashboard
│   │   │   │   └── governance/page.tsx
│   │   │   ├── college-portal/page.tsx
│   │   │   ├── university-portal/page.tsx
│   │   │   ├── attack-demo/page.tsx
│   │   │   └── analytics/page.tsx
│   │   ├── components/
│   │   │   ├── DIDLoginButton.tsx
│   │   │   ├── WalletProvider.tsx
│   │   │   ├── CredentialCard.tsx
│   │   │   ├── ApprovalCard.tsx
│   │   │   ├── AuditLogViewer.tsx
│   │   │   ├── CSVUploader.tsx
│   │   │   ├── AttackPanel.tsx
│   │   │   └── MetricsChart.tsx
│   │   ├── lib/
│   │   │   ├── api.ts            # Backend API client
│   │   │   ├── wallet.ts         # Web Crypto + key management
│   │   │   └── types.ts          # TypeScript interfaces
│   │   └── styles/
│   │       └── globals.css
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── next.config.js
│   └── Dockerfile
│
├── docker-compose.yml
├── README.md
└── docs/
    ├── architecture.md
    ├── api-reference.md
    └── demo-script.md
```

---

## 11. Deployment & Demo Strategy

### Local Development
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev  # port 3000

# Database
docker run -d --name securedid-db \
  -e POSTGRES_DB=securedid \
  -e POSTGRES_PASSWORD=securedid \
  -p 5432:5432 postgres:16
```

### Docker Compose (One-Command)
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: securedid
      POSTGRES_PASSWORD: securedid
    ports: ["5432:5432"]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [db]
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:securedid@db:5432/securedid

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
```

### 3-Minute Demo Script

| Time | Action | Shows |
|------|--------|-------|
| 0:00–0:20 | Landing page overview | Project scope, tech stack |
| 0:20–0:50 | Admin uploads CSV → student registers → panelists approve (batch) | Registration + multisig |
| 0:50–1:10 | Student opens wallet → sees DID + VC + QR ID card | Credential issuance |
| 1:10–1:40 | Student logs into College Portal → then University Portal (same wallet) | One-click auth + cross-service portability |
| 1:40–2:20 | Attack demo: all 3 attacks blocked (fake reg, impersonation, replay) | Security model |
| 2:20–2:40 | Student revokes third-party access → admin revokes a student | Revocation (2 types) |
| 2:40–3:00 | Analytics dashboard — 10 charts, auth rates, benchmarks | Performance proof |

---

## Module Dependency Graph

```
M1 (Foundation)
 ├── M2 (CSV + Registration)
 │    └── M3 (Multisig/Shamir)
 │         └── M4 (DID + VC Issuance)
 │              └── M5 (Wallet)
 │                   └── M6 (Auth Pipeline)
 │                        ├── M7 (Revocation)
 │                        └── M10 (Attack Demo)
 ├── M8 (Governance + Data Updates)
 ├── M9 (Frontend — All Pages) ← depends on all backend modules
 ├── M11 (Analytics + Charts) ← depends on all backend modules
 └── M12 (QR, Export, Polish) ← depends on all modules
```

### Build Order Summary

| Order | Module | Est. Time | Cumulative |
|-------|--------|-----------|------------|
| 1 | M1: Foundation & Database | 1 day | 1 day |
| 2 | M2: CSV + Registration | 1 day | 2 days |
| 3 | M3: Multisig (Shamir) | 1.5 days | 3.5 days |
| 4 | M4: DID + VC Issuance | 1.5 days | 5 days |
| 5 | M5: Wallet | 1.5 days | 6.5 days |
| 6 | M6: Auth Pipeline | 1.5 days | 8 days |
| 7 | M7: Revocation Engine | 1.5 days | 9.5 days |
| 8 | M8: Governance + Updates | 1 day | 10.5 days |
| 9 | M9: Frontend (All Pages) | 3 days | 13.5 days |
| 10 | M10: Attack Demo | 1.5 days | 15 days |
| 11 | M11: Analytics + Charts | 1.5 days | 16.5 days |
| 12 | M12: QR, Export, Polish | 2 days | 18.5 days |

**Total estimated build time: ~18.5 days**

---

*Built by Jay Rane under Silent Minds • Don Bosco College of Engineering, Goa*
