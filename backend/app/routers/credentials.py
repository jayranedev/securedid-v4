"""
M12 credential utilities.

GET /api/credentials/{did}/card    — download PDF ID card with QR code
GET /api/credentials/{did}/export  — export DID Document + VCs as JSON bundle
"""
import io
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import qrcode
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.database import get_db
from app.models.credential import Credential
from app.models.did_document import DIDDocument

router = APIRouter()


@router.get(
    "/credentials/{did}/card",
    summary="[M12] Download PDF ID card with QR code",
)
async def download_id_card(did: str, db: AsyncSession = Depends(get_db)):
    """
    Generates a printable PDF identity card for the given DID.

    The card contains the student's name, roll number, department, year,
    the full DID string, and a QR code that encodes the DID for verifier scanning.
    """
    # Fetch DID Document
    did_result = await db.execute(
        select(DIDDocument).where(
            DIDDocument.did == did,
            DIDDocument.is_active == True,  # noqa: E712
        )
    )
    did_doc = did_result.scalar_one_or_none()
    if did_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DID '{did}' not found.",
        )

    # Fetch most recent non-revoked credential
    cred_result = await db.execute(
        select(Credential)
        .where(
            Credential.holder_did == did,
            Credential.is_revoked == False,  # noqa: E712
        )
        .order_by(Credential.issued_at.desc())
        .limit(1)
    )
    cred = cred_result.scalar_one_or_none()

    # Extract student info from VC subject
    subject: dict = {}
    expires_at_str: str | None = None
    issued_at_str: str | None = None
    if cred:
        subject = cred.vc_json.get("credentialSubject", {})
        expires_at_str = cred.vc_json.get("expirationDate")
        issued_at_str = cred.vc_json.get("issuanceDate")

    name = subject.get("name") or "unknown"
    roll_number = subject.get("rollNumber") or "N/A"
    department = subject.get("department") or "N/A"
    year = str(subject.get("year") or "N/A")

    # ── QR code (encodes the DID string) ─────────────────────────────────────
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=4,
        border=2,
    )
    qr.add_data(did)
    qr.make(fit=True)
    qr_pil = qr.make_image(fill_color="black", back_color="white")
    qr_buf = io.BytesIO()
    qr_pil.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    # ── PDF layout ────────────────────────────────────────────────────────────
    pdf_buf = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buf,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    s_title = ParagraphStyle(
        "CardTitle",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=18,
        spaceAfter=3,
    )
    s_subtitle = ParagraphStyle(
        "CardSubtitle",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=11,
        spaceAfter=10,
        textColor=colors.HexColor("#555555"),
    )
    s_label = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#888888"),
        spaceBefore=6,
    )
    s_value = ParagraphStyle(
        "Value",
        parent=styles["Normal"],
        fontSize=13,
        spaceAfter=2,
    )
    s_mono = ParagraphStyle(
        "Mono",
        parent=styles["Normal"],
        fontSize=7,
        fontName="Courier",
        wordWrap="CJK",
        spaceAfter=4,
    )
    s_footer = ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=9,
        textColor=colors.HexColor("#888888"),
    )

    story = []
    story.append(Paragraph("SecureDID Identity Card", s_title))
    story.append(Paragraph("Don Bosco College of Engineering, Goa", s_subtitle))
    story.append(Spacer(1, 4 * mm))

    # Left column: student info; right column: QR code
    qr_image = Image(qr_buf, width=45 * mm, height=45 * mm)

    left_cells: list = []
    for label, val in [
        ("Full Name", name or "N/A"),
        ("Roll Number", roll_number or "N/A"),
        ("Department", department or "N/A"),
        ("Year", year or "N/A"),
    ]:
        left_cells.append(Paragraph(label, s_label))
        left_cells.append(Paragraph(val, s_value))

    if expires_at_str:
        try:
            exp_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            left_cells.append(Paragraph("Valid Until", s_label))
            left_cells.append(Paragraph(exp_dt.strftime("%d %b %Y"), s_value))
        except ValueError:
            pass

    data = [[left_cells, qr_image]]
    info_table = Table(data, colWidths=[110 * mm, 50 * mm])
    info_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 6 * mm))

    # DID string
    story.append(Paragraph("Decentralized Identifier (DID)", s_label))
    story.append(Paragraph(did, s_mono))

    if did_doc.blockchain_hash:
        story.append(Paragraph("On-chain Anchor (Base Sepolia SHA-256)", s_label))
        story.append(Paragraph(did_doc.blockchain_hash, s_mono))

    story.append(Spacer(1, 8 * mm))
    story.append(
        Paragraph(
            "Scan the QR code at any SecureDID-enabled portal to authenticate.",
            s_footer,
        )
    )

    doc.build(story)
    pdf_buf.seek(0)

    safe_name = name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="securedid_{safe_name}.pdf"',
        },
    )


@router.get(
    "/credentials/{did}/export",
    summary="[M12] Export DID Document + credentials as portable JSON bundle",
)
async def export_credentials(did: str, db: AsyncSession = Depends(get_db)):
    """
    Returns a portable JSON bundle containing the DID Document and all VCs.

    Students can save this file to preserve their identity data independently
    of the SecureDID platform (addresses vendor lock-in concern from SSI literature).
    """
    did_result = await db.execute(
        select(DIDDocument).where(DIDDocument.did == did)
    )
    did_doc = did_result.scalar_one_or_none()
    if did_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DID '{did}' not found.",
        )

    cred_result = await db.execute(
        select(Credential).where(Credential.holder_did == did)
    )
    creds = cred_result.scalars().all()

    bundle = {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "did": did,
        "didDocument": did_doc.did_document,
        "blockchainAnchor": did_doc.blockchain_hash,
        "verifiableCredentials": [
            {
                **c.vc_json,
                "_meta": {
                    "credential_id": str(c.credential_id),
                    "is_revoked": c.is_revoked,
                    "issued_at": c.issued_at.isoformat(),
                    "expires_at": c.expires_at.isoformat(),
                    "revocation_index": c.revocation_index,
                },
            }
            for c in creds
        ],
    }

    return JSONResponse(
        content=bundle,
        headers={
            "Content-Disposition": f'attachment; filename="securedid_{did[:16]}_export.json"',
        },
    )
