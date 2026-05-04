// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DIDRegistryV6 — Safe-style multisig DID registry
 *
 * Key changes from V5:
 *   • No owner. All governance via 3-of-5 panelist proposals.
 *   • Panelist changes via proposal (add/remove/replace a slot).
 *   • Enrollment commitments stored on-chain; raw data never leaves panelist browser.
 *   • Revocation is a 3-of-5 proposal (not a single-panelist action).
 *   • Students publish x25519 encryption pubkey on-chain for VC encryption.
 *   • Analytics: revokedAt[student] timestamp.
 *
 * Invariants:
 *   - panelists[] always has exactly 5 slots; empty slot = address(0).
 *   - A student is only recognised once their commitment is authorised.
 *   - 3-of-5 threshold is a constant; can only be changed by redeploy.
 */
contract DIDRegistryV6 {

    // ── Constants ──────────────────────────────────────────────────────────────

    uint8   public constant THRESHOLD       = 3;
    uint8   public constant PANELIST_COUNT  = 5;
    uint256 public constant PROPOSAL_EXPIRY = 7 days;

    /// Domain separator baked into every enrollment commitment.
    /// Students and panelists must use the same salt when computing commitment hashes.
    bytes32 public constant ENROLLMENT_SALT = keccak256("SecureDID-V6-Enrollment");

    // ── Proposal system ────────────────────────────────────────────────────────

    enum ProposalType {
        ReplacePanelist,   // data: abi.encode(uint8 slot, address newAddr)
        Enrollment,        // data: abi.encode(bytes32 commitment)
        Revocation         // data: abi.encode(address student, string reason)
    }

    struct Proposal {
        ProposalType pType;
        uint8        approvals;
        bool         executed;
        uint64       expiresAt;
        address      proposer;
        bytes        data;
    }

    mapping(uint256 => Proposal)                       public proposals;
    mapping(uint256 => mapping(address => bool))       public proposalVotes;
    uint256 public nextProposalId = 1;

    // ── Panelists ──────────────────────────────────────────────────────────────

    address[PANELIST_COUNT] public panelists;
    mapping(address => bool) private _isPanelist;   // O(1) membership check

    // ── Enrollment registry (authorised commitments) ──────────────────────────

    mapping(bytes32 => bool) public authorizedEnrollments;

    // ── Student state ──────────────────────────────────────────────────────────

    mapping(address => string)  public addressToCID;         // IPFS CID of encrypted VC
    mapping(address => bytes)   public encryptionPubkeys;    // student's x25519 pubkey
    mapping(address => uint8)   public approvalCount;        // pending registration approvals
    mapping(address => mapping(address => bool)) public hasApproved;
    mapping(address => bool)    public pendingRegistration;
    mapping(address => uint256) public revocationIndex;

    // ── Revocation state ───────────────────────────────────────────────────────

    mapping(uint256 => uint256) public revokedSlots;     // packed bitfield
    mapping(address => uint256) public revokedAt;        // timestamp of revocation
    uint256 private _nextRevocationIndex = 1;            // index 0 reserved

    // ── Access grants ──────────────────────────────────────────────────────────

    mapping(address => mapping(address => uint256)) public accessGrants;

    // ── Events ─────────────────────────────────────────────────────────────────

    event StudentRegistered(
        address indexed student,
        bytes32 indexed commitment,
        string metadataHash,
        uint256 timestamp
    );
    event EncryptionKeyPublished(address indexed student, bytes pubkey);
    event DIDIssued(address indexed student, string cid, uint256 revocationIndex, uint256 timestamp);
    event RegistrationApproved(address indexed student, address indexed panelist, uint8 approvalCount);

    event CredentialRevoked(
        address indexed student,
        uint256 revocationIndex,
        string reason,
        uint256 timestamp
    );

    event AccessGranted(address indexed student, address indexed platform, uint256 expiresAt);
    event AccessRevoked(address indexed student, address indexed platform, uint256 timestamp);

    event PanelistReplaced(uint8 indexed slot, address indexed oldAddr, address indexed newAddr);

    event ProposalCreated(uint256 indexed id, ProposalType pType, address indexed proposer);
    event ProposalApproved(uint256 indexed id, address indexed panelist, uint8 approvals);
    event ProposalExecuted(uint256 indexed id);
    event EnrollmentAuthorized(bytes32 indexed commitment);

    // ── Errors ─────────────────────────────────────────────────────────────────

    error NotPanelist();
    error AlreadyPanelist();
    error InvalidSlot();
    error DuplicatePanelist();
    error NotRegistered();
    error AlreadyIssued();
    error AlreadyApproved();
    error NoActiveCID();
    error AlreadyRevoked();
    error ProposalNotFound();
    error ProposalExpired();
    error ProposalAlreadyExecuted();
    error AlreadyVoted();
    error NotAuthorized();
    error InvalidInitialPanelists();

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyPanelist() {
        if (!_isPanelist[msg.sender]) revert NotPanelist();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────

    /**
     * @param _initialPanelists 5 distinct, non-zero panelist addresses.
     *                          No owner. All changes require 3-of-5 vote.
     */
    constructor(address[PANELIST_COUNT] memory _initialPanelists) {
        for (uint8 i = 0; i < PANELIST_COUNT; i++) {
            address a = _initialPanelists[i];
            if (a == address(0)) revert InvalidInitialPanelists();
            if (_isPanelist[a]) revert DuplicatePanelist();
            panelists[i] = a;
            _isPanelist[a] = true;
        }
    }

    // ── Proposals: create ──────────────────────────────────────────────────────

    function proposeReplacePanelist(uint8 slot, address newAddr) external onlyPanelist returns (uint256) {
        if (slot >= PANELIST_COUNT) revert InvalidSlot();
        // newAddr == 0 means "remove" which is fine; duplicate-check happens at execute time
        return _createProposal(ProposalType.ReplacePanelist, abi.encode(slot, newAddr));
    }

    function proposeEnrollment(bytes32 commitment) external onlyPanelist returns (uint256) {
        require(commitment != bytes32(0), "Zero commitment");
        return _createProposal(ProposalType.Enrollment, abi.encode(commitment));
    }

    function proposeRevocation(address student, string calldata reason) external onlyPanelist returns (uint256) {
        if (bytes(addressToCID[student]).length == 0) revert NoActiveCID();
        return _createProposal(ProposalType.Revocation, abi.encode(student, reason));
    }

    function _createProposal(ProposalType pType, bytes memory data) internal returns (uint256) {
        uint256 id = nextProposalId++;
        proposals[id] = Proposal({
            pType:     pType,
            approvals: 0,
            executed:  false,
            expiresAt: uint64(block.timestamp + PROPOSAL_EXPIRY),
            proposer:  msg.sender,
            data:      data
        });
        emit ProposalCreated(id, pType, msg.sender);
        // Proposer auto-votes
        _vote(id);
        return id;
    }

    // ── Proposals: approve / execute ───────────────────────────────────────────

    function approveProposal(uint256 id) external onlyPanelist {
        _vote(id);
    }

    function _vote(uint256 id) internal {
        Proposal storage p = proposals[id];
        if (p.expiresAt == 0)                          revert ProposalNotFound();
        if (p.executed)                                revert ProposalAlreadyExecuted();
        if (block.timestamp > p.expiresAt)             revert ProposalExpired();
        if (proposalVotes[id][msg.sender])             revert AlreadyVoted();

        proposalVotes[id][msg.sender] = true;
        p.approvals++;
        emit ProposalApproved(id, msg.sender, p.approvals);

        if (p.approvals >= THRESHOLD) {
            _execute(id);
        }
    }

    function _execute(uint256 id) internal {
        Proposal storage p = proposals[id];
        p.executed = true;

        if (p.pType == ProposalType.ReplacePanelist) {
            (uint8 slot, address newAddr) = abi.decode(p.data, (uint8, address));
            if (slot >= PANELIST_COUNT) revert InvalidSlot();
            if (newAddr != address(0) && _isPanelist[newAddr]) revert DuplicatePanelist();

            address old = panelists[slot];
            if (old != address(0)) _isPanelist[old] = false;
            panelists[slot] = newAddr;
            if (newAddr != address(0)) _isPanelist[newAddr] = true;
            emit PanelistReplaced(slot, old, newAddr);

        } else if (p.pType == ProposalType.Enrollment) {
            bytes32 commitment = abi.decode(p.data, (bytes32));
            authorizedEnrollments[commitment] = true;
            emit EnrollmentAuthorized(commitment);

        } else if (p.pType == ProposalType.Revocation) {
            (address student, string memory reason) = abi.decode(p.data, (address, string));
            if (bytes(addressToCID[student]).length == 0) revert NoActiveCID();
            uint256 rIdx = revocationIndex[student];
            if (isRevoked(rIdx)) revert AlreadyRevoked();

            uint256 slot = rIdx / 256;
            uint256 bit  = rIdx % 256;
            revokedSlots[slot] |= (1 << bit);
            revokedAt[student] = block.timestamp;

            emit CredentialRevoked(student, rIdx, reason, block.timestamp);
        }

        emit ProposalExecuted(id);
    }

    // ── Student Enrollment ─────────────────────────────────────────────────────

    /**
     * @notice Student calls this with a pre-authorised commitment + their encryption pubkey.
     *         Commitment must have been added via an `Enrollment` proposal first.
     * @param metadataHash Public metadata hash (hex) for audit/display
     * @param commitment   keccak256(SALT || email || roll || name || dept || year || secretHash)
     * @param encPubkey    Student's x25519 encryption pubkey (32 bytes) for VC encryption
     */
    function registerStudent(
        string calldata metadataHash,
        bytes32 commitment,
        bytes calldata encPubkey
    ) external {
        address student = msg.sender;
        if (!authorizedEnrollments[commitment]) revert NotAuthorized();
        if (bytes(addressToCID[student]).length != 0) revert AlreadyIssued();
        require(!pendingRegistration[student], "Already pending");
        require(encPubkey.length == 32, "Bad encryption pubkey");

        // Commitment is single-use
        authorizedEnrollments[commitment] = false;

        encryptionPubkeys[student] = encPubkey;
        pendingRegistration[student] = true;

        emit EncryptionKeyPublished(student, encPubkey);
        emit StudentRegistered(student, commitment, metadataHash, block.timestamp);
    }

    /**
     * @notice Panelist approves a pending registration. 3-of-5 → DID issued.
     */
    function approveStudent(address student, string calldata cid) external onlyPanelist {
        if (bytes(addressToCID[student]).length != 0) revert AlreadyIssued();
        if (!pendingRegistration[student]) revert NotRegistered();
        if (hasApproved[student][msg.sender]) revert AlreadyApproved();

        hasApproved[student][msg.sender] = true;
        approvalCount[student]++;
        emit RegistrationApproved(student, msg.sender, approvalCount[student]);

        if (approvalCount[student] >= THRESHOLD) {
            uint256 rIdx = _nextRevocationIndex++;
            addressToCID[student] = cid;
            revocationIndex[student] = rIdx;
            pendingRegistration[student] = false;
            emit DIDIssued(student, cid, rIdx, block.timestamp);
        }
    }

    // ── Access grants (unchanged from V5) ──────────────────────────────────────

    function grantAccess(address platform, uint256 ttlSeconds) external {
        uint256 expiry = ttlSeconds == 0 ? type(uint256).max : block.timestamp + ttlSeconds;
        accessGrants[msg.sender][platform] = expiry;
        emit AccessGranted(msg.sender, platform, expiry);
    }

    function revokeAccess(address platform) external {
        accessGrants[msg.sender][platform] = 0;
        emit AccessRevoked(msg.sender, platform, block.timestamp);
    }

    // ── View functions ─────────────────────────────────────────────────────────

    function isPanelist(address addr) external view returns (bool) {
        return _isPanelist[addr];
    }

    function getPanelists() external view returns (address[PANELIST_COUNT] memory) {
        return panelists;
    }

    function getCID(address student) external view returns (string memory) {
        return addressToCID[student];
    }

    function getEncryptionPubkey(address student) external view returns (bytes memory) {
        return encryptionPubkeys[student];
    }

    function isRevoked(uint256 rIdx) public view returns (bool) {
        if (rIdx == 0) return false;
        uint256 slot = rIdx / 256;
        uint256 bit  = rIdx % 256;
        return (revokedSlots[slot] & (1 << bit)) != 0;
    }

    function isStudentRevoked(address student) external view returns (bool) {
        return isRevoked(revocationIndex[student]);
    }

    function hasAccess(address student, address platform) external view returns (bool) {
        uint256 expiry = accessGrants[student][platform];
        return expiry > 0 && expiry > block.timestamp;
    }

    function isEnrollmentAuthorized(bytes32 commitment) external view returns (bool) {
        return authorizedEnrollments[commitment];
    }

    function nextRevocationIndex() external view returns (uint256) {
        return _nextRevocationIndex;
    }

    /**
     * @notice Returns a proposal's scalar fields (data is available via proposals() getter).
     */
    function getProposal(uint256 id) external view returns (
        ProposalType pType,
        uint8 approvals,
        bool executed,
        uint64 expiresAt,
        address proposer,
        bytes memory data
    ) {
        Proposal storage p = proposals[id];
        return (p.pType, p.approvals, p.executed, p.expiresAt, p.proposer, p.data);
    }

    function hasVoted(uint256 id, address panelist) external view returns (bool) {
        return proposalVotes[id][panelist];
    }
}
