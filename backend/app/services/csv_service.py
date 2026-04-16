"""
CSV upload service.

Responsibilities:
- Parse uploaded CSV bytes
- Validate required columns exist
- Detect duplicates within the file
- Flag conflicts with existing DB records
- Hash secret_key values before storage
- Bulk-insert valid rows into csv_records
"""
import csv
import io
import uuid
from dataclasses import dataclass

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.csv_record import CSVRecord
from app.utils.hashing import hash_secret_key

REQUIRED_COLUMNS = {
    "email",
    "roll_number",
    "full_name",
    "dob",
    "department",
    "year",
    "secret_key",
}


@dataclass
class CSVUploadResult:
    total_rows: int
    inserted: int
    skipped_duplicates: int       # already registered or duplicate within file
    skipped_conflicts: int        # same email exists from another panelist's CSV
    errors: list[str]             # row-level validation errors (non-fatal)


async def process_csv_upload(
    db: AsyncSession,
    file_bytes: bytes,
    uploaded_by: uuid.UUID,
) -> CSVUploadResult:
    """
    Parse *file_bytes* as CSV, validate, and insert valid rows.
    Returns a summary of what happened.
    """
    # ── 1. Decode & parse ───────────────────────────────────────────────────
    text = file_bytes.decode("utf-8-sig")   # strip BOM if present
    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        raise ValueError("CSV file is empty or has no header row")

    # Normalize column names (strip whitespace, lowercase)
    normalized_fields = {f.strip().lower() for f in reader.fieldnames}
    missing = REQUIRED_COLUMNS - normalized_fields
    if missing:
        raise ValueError(f"CSV missing required columns: {', '.join(sorted(missing))}")

    rows = list(reader)
    if not rows:
        raise ValueError("CSV has a header but no data rows")

    # ── 2. Pre-fetch all existing emails for this conflict check ────────────
    existing = await db.execute(select(CSVRecord.email, CSVRecord.roll_number))
    existing_pairs: set[tuple[str, str]] = {
        (row.email.lower(), row.roll_number.upper())
        for row in existing.fetchall()
    }

    # ── 3. Process rows ─────────────────────────────────────────────────────
    seen_in_file: set[tuple[str, str]] = set()
    to_insert: list[CSVRecord] = []
    skipped_dup = 0
    skipped_conflict = 0
    errors: list[str] = []

    for i, raw in enumerate(rows, start=2):  # row 1 = header
        # Normalize keys
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw.items()}

        email = row.get("email", "").lower()
        roll  = row.get("roll_number", "").upper()

        # Basic presence check
        if not email or not roll:
            errors.append(f"Row {i}: email or roll_number is empty — skipped")
            continue

        year_str = row.get("year", "")
        try:
            year = int(year_str)
            if year not in range(1, 5):
                raise ValueError
        except ValueError:
            errors.append(f"Row {i} ({email}): year must be 1–4, got '{year_str}' — skipped")
            continue

        # Within-file duplicate
        pair = (email, roll)
        if pair in seen_in_file:
            skipped_dup += 1
            errors.append(f"Row {i} ({email}): duplicate within this file — skipped")
            continue
        seen_in_file.add(pair)

        # Cross-file conflict (another panelist's CSV already has this student)
        if pair in existing_pairs:
            skipped_conflict += 1
            errors.append(f"Row {i} ({email}): student already exists in system — skipped")
            continue

        secret_raw = row.get("secret_key", "")
        if not secret_raw:
            errors.append(f"Row {i} ({email}): secret_key is empty — skipped")
            continue

        to_insert.append(
            CSVRecord(
                email=email,
                roll_number=roll,
                full_name=row.get("full_name", ""),
                dob=row.get("dob", ""),
                department=row.get("department", "").upper(),
                year=year,
                secret_key_hash=hash_secret_key(secret_raw),
                uploaded_by=uploaded_by,
            )
        )
        # Track so later rows in same file don't conflict with this one
        existing_pairs.add(pair)

    # ── 4. Bulk insert ───────────────────────────────────────────────────────
    if to_insert:
        db.add_all(to_insert)

    return CSVUploadResult(
        total_rows=len(rows),
        inserted=len(to_insert),
        skipped_duplicates=skipped_dup,
        skipped_conflicts=skipped_conflict,
        errors=errors,
    )
