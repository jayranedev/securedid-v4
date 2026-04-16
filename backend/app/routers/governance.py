"""
Governance router — panelist voting on add/remove panelist proposals.

POST /api/governance/propose          — create proposal (JWT required)
POST /api/governance/vote/{proposal_id} — cast vote (JWT required)
GET  /api/governance/proposals        — list all proposals (JWT required)
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_panelist
from app.models.governance import GovernanceProposal, GovernanceVote
from app.models.institution_key import InstitutionKey
from app.models.panelist import Panelist
from app.schemas.governance import ProposeRequest, ProposalOut, VoteRequest
from app.services import shamir_service

router = APIRouter()

# Majority threshold: 3 of 5 (or 3 of N active panelists for removal)
GOVERNANCE_THRESHOLD = 3
REJECTION_THRESHOLD = 2   # 2 NOs = proposal fails


@router.post(
    "/propose",
    response_model=ProposalOut,
    status_code=status.HTTP_201_CREATED,
    summary="[M8] Create a governance proposal (add/remove panelist)",
)
async def create_proposal(
    body: ProposeRequest,
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """
    Any panelist can propose:
      - remove_panelist: target_panelist_id required
      - add_panelist:    new_panelist_name, new_panelist_email, new_panelist_department required
    Proposal expires after 24 hours.
    """
    if body.proposal_type not in ("add_panelist", "remove_panelist"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="proposal_type must be 'add_panelist' or 'remove_panelist'",
        )

    if body.proposal_type == "remove_panelist":
        if not body.target_panelist_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="target_panelist_id required for remove_panelist",
            )
        # Can't propose removing yourself
        if body.target_panelist_id == current.panelist_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot propose removing yourself.",
            )
        # Verify target exists
        target = await db.get(Panelist, body.target_panelist_id)
        if target is None or not target.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target panelist not found.")

    if body.proposal_type == "add_panelist":
        if not (body.new_panelist_name and body.new_panelist_email and body.new_panelist_department):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="new_panelist_name, new_panelist_email, new_panelist_department required for add_panelist",
            )

    now = datetime.now(timezone.utc)
    proposal = GovernanceProposal(
        proposal_type=body.proposal_type,
        target_panelist_id=body.target_panelist_id,
        new_panelist_name=body.new_panelist_name,
        new_panelist_email=str(body.new_panelist_email).lower() if body.new_panelist_email else None,
        new_panelist_department=body.new_panelist_department.upper() if body.new_panelist_department else None,
        proposed_by=current.panelist_id,
        reason=body.reason,
        votes_yes=0,
        votes_no=0,
        status="pending",
        created_at=now,
        expires_at=now + timedelta(hours=24),
    )
    db.add(proposal)
    await db.flush()
    return proposal


@router.post(
    "/vote/{proposal_id}",
    response_model=ProposalOut,
    summary="[M8] Cast a YES/NO vote on a governance proposal",
)
async def vote_on_proposal(
    proposal_id: uuid.UUID,
    body: VoteRequest,
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    """
    Each panelist can vote once. When 3 YES votes are collected → proposal passes.
    When 2 NO votes → proposal rejected.
    On pass: executes the proposal (removes panelist / prepares for add).
    """
    proposal = await db.get(GovernanceProposal, proposal_id)
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")
    if proposal.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Proposal is already {proposal.status}.",
        )
    if datetime.now(timezone.utc) > proposal.expires_at:
        proposal.status = "expired"
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="Proposal has expired."
        )

    # Check for duplicate vote
    existing_vote = await db.execute(
        select(GovernanceVote).where(
            GovernanceVote.proposal_id == proposal_id,
            GovernanceVote.panelist_id == current.panelist_id,
        )
    )
    if existing_vote.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="You have already voted on this proposal."
        )

    # Record vote
    vote_record = GovernanceVote(
        proposal_id=proposal_id,
        panelist_id=current.panelist_id,
        vote=body.vote,
    )
    db.add(vote_record)

    if body.vote:
        proposal.votes_yes += 1
    else:
        proposal.votes_no += 1

    # Check resolution
    if proposal.votes_yes >= GOVERNANCE_THRESHOLD:
        proposal.status = "passed"
        proposal.resolved_at = datetime.now(timezone.utc)
        await _execute_proposal(db, proposal)
    elif proposal.votes_no >= REJECTION_THRESHOLD:
        proposal.status = "rejected"
        proposal.resolved_at = datetime.now(timezone.utc)

    await db.flush()
    return proposal


@router.get(
    "/proposals",
    response_model=list[ProposalOut],
    summary="[M8] List all governance proposals",
)
async def list_proposals(
    current: Panelist = Depends(get_current_panelist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GovernanceProposal).order_by(GovernanceProposal.created_at.desc())
    )
    return result.scalars().all()


# ── Proposal execution ────────────────────────────────────────────────────────

async def _execute_proposal(db: AsyncSession, proposal: GovernanceProposal) -> None:
    """Execute a passed proposal."""
    if proposal.proposal_type == "remove_panelist" and proposal.target_panelist_id:
        target = await db.get(Panelist, proposal.target_panelist_id)
        if target:
            target.is_active = False
            target.key_share_hash = None
            target.key_share_encrypted = None

    elif proposal.proposal_type == "add_panelist" and proposal.new_panelist_email:
        # Count active panelists for resharing
        active_result = await db.execute(
            select(Panelist).where(Panelist.is_active == True)  # noqa: E712
        )
        active_panelists = list(active_result.scalars().all())

        # Check new panelist doesn't already exist
        existing = await db.execute(
            select(Panelist).where(Panelist.email == proposal.new_panelist_email)
        )
        if existing.scalar_one_or_none():
            return  # already exists, skip silently

        from app.utils.hashing import hash_password
        new_panelist = Panelist(
            name=proposal.new_panelist_name or "New Panelist",
            email=proposal.new_panelist_email,
            department=(proposal.new_panelist_department or "TBD").upper(),
            password_hash=hash_password("ChangeMe@2026!"),  # temp password
            is_active=True,
        )
        db.add(new_panelist)
        await db.flush()

        # Reshare master key among all active panelists (including new one)
        all_panelists = active_panelists + [new_panelist]
        n = len(all_panelists)
        k = min(settings.SHAMIR_THRESHOLD, n)   # threshold can't exceed n

        institution_key_result = await db.execute(select(InstitutionKey))
        institution_key = institution_key_result.scalars().first()
        if institution_key is None:
            return  # keys not set up, skip resharing

        # Reconstruct from any k existing shares
        existing_shares = [
            p.key_share_encrypted for p in active_panelists
            if p.key_share_encrypted and p.key_share_hash
        ]
        if len(existing_shares) < k:
            return   # not enough shares to reconstruct

        combined_bytes = shamir_service.combine_shares(
            [shamir_service.hex_to_share(s) for s in existing_shares[:k]]
        )
        new_shares = shamir_service.split_key(combined_bytes, n=n, k=k)
        for panelist, share in zip(all_panelists, new_shares):
            panelist.key_share_hash = shamir_service.hash_share(share)
            panelist.key_share_encrypted = shamir_service.share_to_hex(share)
