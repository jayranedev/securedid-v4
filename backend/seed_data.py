"""
Seed script — run once to populate the database for demos and testing.

Creates:
  • 5 panelists (one per department)
  • sample_students.csv  (20 students across all 5 departments)
  • 1 RevocationRegistry row (required before M4 can issue credentials)

Usage:
  cd backend
  ./venv/Scripts/python seed_data.py
"""
import asyncio
import csv
import os
import sys

# Make sure we can import app modules
sys.path.insert(0, os.path.dirname(__file__))

import httpx

BASE_URL = "http://localhost:8000"
SUPER_SECRET = os.environ.get("SUPER_ADMIN_SECRET", "securedid-super-admin-2026")

# ── Panelists ────────────────────────────────────────────────────────────────

PANELISTS = [
    {"name": "Dr. Ramesh Naik",   "email": "ramesh.naik@dbce.edu",   "department": "CS",    "password": "CS@Panelist2026"},
    {"name": "Dr. Priya Sharma",  "email": "priya.sharma@dbce.edu",  "department": "IT",    "password": "IT@Panelist2026"},
    {"name": "Dr. Vikram Patel",  "email": "vikram.patel@dbce.edu",  "department": "EC",    "password": "EC@Panelist2026"},
    {"name": "Dr. Anita Desai",   "email": "anita.desai@dbce.edu",   "department": "ME",    "password": "ME@Panelist2026"},
    {"name": "Dr. Suresh Kamat",  "email": "suresh.kamat@dbce.edu",  "department": "CIVIL", "password": "CIVIL@Panelist2026"},
]

# ── Students (20 across 5 departments) ───────────────────────────────────────

STUDENTS = [
    # CS — 4 students
    {"email": "arjun.mehta@student.dbce.edu",   "roll_number": "21CS001", "full_name": "Arjun Mehta",    "dob": "2002-05-14", "department": "CS",    "year": 4, "secret_key": "sk_arjun_cs_001"},
    {"email": "neha.joshi@student.dbce.edu",    "roll_number": "21CS002", "full_name": "Neha Joshi",     "dob": "2002-08-22", "department": "CS",    "year": 4, "secret_key": "sk_neha_cs_002"},
    {"email": "rohan.kulkarni@student.dbce.edu","roll_number": "22CS001", "full_name": "Rohan Kulkarni", "dob": "2003-01-10", "department": "CS",    "year": 3, "secret_key": "sk_rohan_cs_003"},
    {"email": "sanya.bhat@student.dbce.edu",    "roll_number": "22CS002", "full_name": "Sanya Bhat",     "dob": "2003-03-18", "department": "CS",    "year": 3, "secret_key": "sk_sanya_cs_004"},
    # IT — 4 students
    {"email": "kiran.shetty@student.dbce.edu",  "roll_number": "21IT001", "full_name": "Kiran Shetty",   "dob": "2002-07-05", "department": "IT",    "year": 4, "secret_key": "sk_kiran_it_001"},
    {"email": "aisha.khan@student.dbce.edu",    "roll_number": "21IT002", "full_name": "Aisha Khan",     "dob": "2002-11-29", "department": "IT",    "year": 4, "secret_key": "sk_aisha_it_002"},
    {"email": "dev.pillai@student.dbce.edu",    "roll_number": "22IT001", "full_name": "Dev Pillai",     "dob": "2003-06-15", "department": "IT",    "year": 3, "secret_key": "sk_dev_it_003"},
    {"email": "meera.nair@student.dbce.edu",    "roll_number": "22IT002", "full_name": "Meera Nair",     "dob": "2003-09-04", "department": "IT",    "year": 3, "secret_key": "sk_meera_it_004"},
    # EC — 4 students
    {"email": "amit.verma@student.dbce.edu",    "roll_number": "21EC001", "full_name": "Amit Verma",     "dob": "2002-04-20", "department": "EC",    "year": 4, "secret_key": "sk_amit_ec_001"},
    {"email": "priti.gawde@student.dbce.edu",   "roll_number": "21EC002", "full_name": "Priti Gawde",    "dob": "2002-12-01", "department": "EC",    "year": 4, "secret_key": "sk_priti_ec_002"},
    {"email": "rajan.tiwari@student.dbce.edu",  "roll_number": "22EC001", "full_name": "Rajan Tiwari",   "dob": "2003-02-14", "department": "EC",    "year": 3, "secret_key": "sk_rajan_ec_003"},
    {"email": "sara.dsouza@student.dbce.edu",   "roll_number": "22EC002", "full_name": "Sara D'Souza",   "dob": "2003-07-30", "department": "EC",    "year": 3, "secret_key": "sk_sara_ec_004"},
    # ME — 4 students
    {"email": "nikhil.parab@student.dbce.edu",  "roll_number": "21ME001", "full_name": "Nikhil Parab",   "dob": "2002-09-17", "department": "ME",    "year": 4, "secret_key": "sk_nikhil_me_001"},
    {"email": "divya.rao@student.dbce.edu",     "roll_number": "21ME002", "full_name": "Divya Rao",      "dob": "2002-06-25", "department": "ME",    "year": 4, "secret_key": "sk_divya_me_002"},
    {"email": "anand.garg@student.dbce.edu",    "roll_number": "22ME001", "full_name": "Anand Garg",     "dob": "2003-04-08", "department": "ME",    "year": 3, "secret_key": "sk_anand_me_003"},
    {"email": "jyoti.hegde@student.dbce.edu",   "roll_number": "22ME002", "full_name": "Jyoti Hegde",    "dob": "2003-10-22", "department": "ME",    "year": 3, "secret_key": "sk_jyoti_me_004"},
    # Civil — 4 students
    {"email": "farhan.shaikh@student.dbce.edu", "roll_number": "21CIVIL001","full_name": "Farhan Shaikh", "dob": "2002-03-30", "department": "CIVIL", "year": 4, "secret_key": "sk_farhan_civil_001"},
    {"email": "lakshmi.iyer@student.dbce.edu",  "roll_number": "21CIVIL002","full_name": "Lakshmi Iyer",  "dob": "2002-10-11", "department": "CIVIL", "year": 4, "secret_key": "sk_lakshmi_civil_002"},
    {"email": "omar.shaikh@student.dbce.edu",   "roll_number": "22CIVIL001","full_name": "Omar Shaikh",   "dob": "2003-05-05", "department": "CIVIL", "year": 3, "secret_key": "sk_omar_civil_003"},
    {"email": "tanvi.sawant@student.dbce.edu",  "roll_number": "22CIVIL002","full_name": "Tanvi Sawant",  "dob": "2003-08-19", "department": "CIVIL", "year": 3, "secret_key": "sk_tanvi_civil_004"},
]


def write_csv(path: str) -> str:
    """Write the sample students CSV file and return its path."""
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["email", "roll_number", "full_name", "dob", "department", "year", "secret_key"],
        )
        writer.writeheader()
        writer.writerows(STUDENTS)
    print(f"  >> wrote {len(STUDENTS)} students to {path}")
    return path


async def seed():
    csv_path = os.path.join(os.path.dirname(__file__), "sample_students.csv")
    write_csv(csv_path)

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as client:
        # ── 1. Create panelists ──────────────────────────────────────────────
        print("\n[1/3] Creating panelists...")
        created_panelists = []
        for p in PANELISTS:
            resp = await client.post(
                "/api/admin/create-panelist",
                json=p,
                headers={"X-Super-Admin-Secret": SUPER_SECRET},
            )
            if resp.status_code == 201:
                created_panelists.append(resp.json())
                print(f"  ✓  {p['name']} ({p['department']})")
            elif resp.status_code == 409:
                print(f"  ⚠  {p['name']} already exists — skipping")
            else:
                print(f"  ✗  {p['name']} failed: {resp.text}")

        # ── 2. Login as first panelist and upload CSV ────────────────────────
        print("\n[2/3] Uploading student CSV as CS panelist...")
        login_resp = await client.post(
            "/api/admin/login",
            json={"email": PANELISTS[0]["email"], "password": PANELISTS[0]["password"]},
        )
        if login_resp.status_code != 200:
            print(f"  ✗  Login failed: {login_resp.text}")
            return

        token = login_resp.json()["access_token"]
        print(f"  ✓  Logged in as {PANELISTS[0]['name']}")

        with open(csv_path, "rb") as f:
            upload_resp = await client.post(
                "/api/admin/upload-csv",
                files={"file": ("sample_students.csv", f, "text/csv")},
                headers={"Authorization": f"Bearer {token}"},
            )

        if upload_resp.status_code == 200:
            data = upload_resp.json()
            print(f"  ✓  {data['message']}")
        else:
            print(f"  ✗  Upload failed: {upload_resp.text}")
            return

        # ── 3. Seed revocation registry via DB ───────────────────────────────
        print("\n[3/3] Creating revocation registry row...")
        from app.database import AsyncSessionLocal
        from app.models.revocation import RevocationRegistry
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            existing = await db.execute(select(RevocationRegistry))
            if not existing.scalars().first():
                db.add(RevocationRegistry())
                await db.commit()
                print("  ✓  Revocation registry initialized (2048-bit bitstring)")
            else:
                print("  ⚠  Revocation registry already exists — skipping")

    print("\n✅  Seed complete!")
    print("\nPanelist credentials:")
    for p in PANELISTS:
        print(f"  {p['email']}  /  {p['password']}")
    print("\nSample student (use in /api/register):")
    s = STUDENTS[0]
    print(f"  email={s['email']}")
    print(f"  roll_number={s['roll_number']}")
    print(f"  dob={s['dob']}")
    print(f"  department={s['department']}")
    print(f"  year={s['year']}")
    print(f"  secret_key={s['secret_key']}")
    print(f"  full_name={s['full_name']}")


if __name__ == "__main__":
    asyncio.run(seed())
