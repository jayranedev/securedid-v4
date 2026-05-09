// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DIDRegistryV6 — Safe-style multisig DID registry
 *
 * Key changes from original V6:
 *   • Panelist count and vote threshold are set at deploy time (not hardcoded).
 *   • Panelists array is dynamic (max 10); add/remove via governance proposals.
 *   • Threshold can be changed via ChangeThreshold proposal.
 *   • All governance via threshold-of-N panelist proposals.
 */
contract DIDRegistryV6 {

    // ── Constants ──────────────────────────────────────────────────────────────

    uint8   public constant MAX_PANELISTS   = 10;
    uint256 public constant PROPOSAL_EXPIRY = 7 days;
    bytes32 public constant ENROLLMENT_SALT = keccak256("SecureDID-V6-Enrollment");

    // ── Proposal system ────────────────────────────────────────────────────────

    enum ProposalType {
        ReplacePanelist,   // 0: abi.encode(uint8 slot, address newAddr)
        Enrollment,        // 1: abi.encode(bytes32 commitment)
        Revocation,        // 2: abi.encode(address student, string reason)
        ChangeThreshold,   // 3: abi.encode(uint8 newThreshold)
        AddPanelist,       // 4: abi.encode(address newPanelist)
        RemovePanelist     // 5: abi.encode(address panelistAddr)
    }

    enum IdentityStatus {
        ACTIVE,
        GRADUATED,
        DROPPED,
        REVOKED
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

    address[] public panelistList;
    mapping(address => bool) private _isPanelist;
    uint8 public threshold;

    // ── Enrollment registry ────────────────────────────────────────────────────

    mapping(bytes32 => bool) public authorizedEnrollments;

    // ── Student state ──────────────────────────────────────────────────────────

    mapping(address => string)  public addressToCID;
    mapping(address => bytes)   public encryptionPubkeys;
    mapping(address => uint8)   public approvalCount;
    mapping(address => mapping(address => bool)) public hasApproved;
    mapping(address => bool)    public pendingRegistration;
    mapping(address => uint256) public revocationIndex;
    mapping(address => IdentityStatus) public identityStatus;

    // ── Revocation state ───────────────────────────────────────────────────────

    mapping(uint256 => uint256) public revokedSlots;
    mapping(address => uint256) public revokedAt;
    uint256 private _nextRevocationIndex = 1;

    // ── Access grants ──────────────────────────────────────────────────────────

    mapping(address => mapping(address => uint256)) public accessGrants;

    // ── Events ─────────────────────────────────────────────────────────────────

    event StudentRegistered(address indexed student, bytes32 indexed commitment, string metadataHash, uint256 timestamp);
    event EncryptionKeyPublished(address indexed student, bytes pubkey);
    event DIDIssued(address indexed student, string cid, uint256 revocationIndex, uint256 timestamp);
    event RegistrationApproved(address indexed student, address indexed panelist, uint8 approvalCount);
    event CredentialRevoked(address indexed student, uint256 revocationIndex, string reason, uint256 timestamp);
    event AccessGranted(address indexed student, address indexed platform, uint256 expiresAt);
    event AccessRevoked(address indexed student, address indexed platform, uint256 timestamp);
    event PanelistReplaced(uint8 indexed slot, address indexed oldAddr, address indexed newAddr);
    event PanelistAdded(address indexed newPanelist);
    event PanelistRemoved(address indexed removedPanelist);
    event ThresholdChanged(uint8 oldThreshold, uint8 newThreshold);
    event ProposalCreated(uint256 indexed id, uint8 pType, address indexed proposer);
    event ProposalApproved(uint256 indexed id, address indexed panelist, uint8 approvals);
    event ProposalExecuted(uint256 indexed id);
    event EnrollmentAuthorized(bytes32 indexed commitment);
    event IdentityStatusUpdated(address indexed student, IdentityStatus status, uint256 timestamp);
    event IdentityReactivated(address indexed student, uint256 timestamp);

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
    error MaxPanelistsReached();
    error ThresholdViolation();
    error InvalidThreshold();
    error InvalidStatusUpdate();

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyPanelist() {
        if (!_isPanelist[msg.sender]) revert NotPanelist();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(address[] memory _initialPanelists, uint8 _threshold) {
        uint256 n = _initialPanelists.length;
        if (n == 0 || n > MAX_PANELISTS) revert InvalidInitialPanelists();
        if (_threshold == 0 || _threshold > n) revert InvalidThreshold();
        for (uint256 i = 0; i < n; i++) {
            address a = _initialPanelists[i];
            if (a == address(0)) revert InvalidInitialPanelists();
            if (_isPanelist[a]) revert DuplicatePanelist();
            panelistList.push(a);
            _isPanelist[a] = true;
        }
        threshold = _threshold;
    }

    // ── Proposals: create ──────────────────────────────────────────────────────

    function proposeReplacePanelist(uint8 slot, address newAddr) external onlyPanelist returns (uint256) {
        if (slot >= panelistList.length) revert InvalidSlot();
        if (newAddr == address(0)) revert InvalidInitialPanelists();
        if (_isPanelist[newAddr] && panelistList[slot] != newAddr) revert DuplicatePanelist();
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

    function proposeChangeThreshold(uint8 newThreshold) external onlyPanelist returns (uint256) {
        if (newThreshold == 0 || newThreshold > panelistList.length) revert InvalidThreshold();
        return _createProposal(ProposalType.ChangeThreshold, abi.encode(newThreshold));
    }

    function proposeAddPanelist(address newPanelist) external onlyPanelist returns (uint256) {
        if (panelistList.length >= MAX_PANELISTS) revert MaxPanelistsReached();
        if (newPanelist == address(0)) revert InvalidInitialPanelists();
        if (_isPanelist[newPanelist]) revert DuplicatePanelist();
        return _createProposal(ProposalType.AddPanelist, abi.encode(newPanelist));
    }

    function proposeRemovePanelist(address panelistAddr) external onlyPanelist returns (uint256) {
        if (!_isPanelist[panelistAddr]) revert NotPanelist();
        if (panelistList.length <= threshold) revert ThresholdViolation();
        return _createProposal(ProposalType.RemovePanelist, abi.encode(panelistAddr));
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
        emit ProposalCreated(id, uint8(pType), msg.sender);
        _vote(id);
        return id;
    }

    // ── Proposals: approve / execute ───────────────────────────────────────────

    function approveProposal(uint256 id) external onlyPanelist {
        _vote(id);
    }

    function _vote(uint256 id) internal {
        Proposal storage p = proposals[id];
        if (p.expiresAt == 0)               revert ProposalNotFound();
        if (p.executed)                     revert ProposalAlreadyExecuted();
        if (block.timestamp > p.expiresAt)  revert ProposalExpired();
        if (proposalVotes[id][msg.sender])  revert AlreadyVoted();

        proposalVotes[id][msg.sender] = true;
        p.approvals++;
        emit ProposalApproved(id, msg.sender, p.approvals);

        if (p.approvals >= threshold) {
            _execute(id);
        }
    }

    function _execute(uint256 id) internal {
        Proposal storage p = proposals[id];
        p.executed = true;

        if (p.pType == ProposalType.ReplacePanelist) {
            (uint8 slot, address newAddr) = abi.decode(p.data, (uint8, address));
            if (slot >= panelistList.length) revert InvalidSlot();
            if (_isPanelist[newAddr] && panelistList[slot] != newAddr) revert DuplicatePanelist();
            address old = panelistList[slot];
            _isPanelist[old] = false;
            panelistList[slot] = newAddr;
            _isPanelist[newAddr] = true;
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
            identityStatus[student] = IdentityStatus.REVOKED;
            emit IdentityStatusUpdated(student, IdentityStatus.REVOKED, block.timestamp);
            emit CredentialRevoked(student, rIdx, reason, block.timestamp);

        } else if (p.pType == ProposalType.ChangeThreshold) {
            uint8 newThreshold = abi.decode(p.data, (uint8));
            if (newThreshold == 0 || newThreshold > panelistList.length) revert InvalidThreshold();
            uint8 old = threshold;
            threshold = newThreshold;
            emit ThresholdChanged(old, newThreshold);

        } else if (p.pType == ProposalType.AddPanelist) {
            address newPanelist = abi.decode(p.data, (address));
            if (panelistList.length >= MAX_PANELISTS) revert MaxPanelistsReached();
            if (_isPanelist[newPanelist]) revert DuplicatePanelist();
            panelistList.push(newPanelist);
            _isPanelist[newPanelist] = true;
            emit PanelistAdded(newPanelist);

        } else if (p.pType == ProposalType.RemovePanelist) {
            address panelistAddr = abi.decode(p.data, (address));
            if (!_isPanelist[panelistAddr]) revert NotPanelist();
            if (panelistList.length <= threshold) revert ThresholdViolation();
            _isPanelist[panelistAddr] = false;
            for (uint256 i = 0; i < panelistList.length; i++) {
                if (panelistList[i] == panelistAddr) {
                    panelistList[i] = panelistList[panelistList.length - 1];
                    panelistList.pop();
                    break;
                }
            }
            emit PanelistRemoved(panelistAddr);
        }

        emit ProposalExecuted(id);
    }

    // ── Student Enrollment ─────────────────────────────────────────────────────

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

        authorizedEnrollments[commitment] = false;
        encryptionPubkeys[student] = encPubkey;
        pendingRegistration[student] = true;

        emit EncryptionKeyPublished(student, encPubkey);
        emit StudentRegistered(student, commitment, metadataHash, block.timestamp);
    }

    function approveStudent(address student, string calldata cid) external onlyPanelist {
        if (bytes(addressToCID[student]).length != 0) revert AlreadyIssued();
        if (!pendingRegistration[student]) revert NotRegistered();
        if (hasApproved[student][msg.sender]) revert AlreadyApproved();

        hasApproved[student][msg.sender] = true;
        approvalCount[student]++;
        emit RegistrationApproved(student, msg.sender, approvalCount[student]);

        if (approvalCount[student] >= threshold) {
            uint256 rIdx = _nextRevocationIndex++;
            addressToCID[student] = cid;
            revocationIndex[student] = rIdx;
            pendingRegistration[student] = false;
            identityStatus[student] = IdentityStatus.ACTIVE;
            emit IdentityStatusUpdated(student, IdentityStatus.ACTIVE, block.timestamp);
            emit DIDIssued(student, cid, rIdx, block.timestamp);
        }
    }

    // ── Identity status ──────────────────────────────────────────────────────

    function updateStatus(address student, IdentityStatus status) external onlyPanelist {
        if (bytes(addressToCID[student]).length == 0) revert NotRegistered();
        if (status == IdentityStatus.REVOKED) revert InvalidStatusUpdate();
        identityStatus[student] = status;
        emit IdentityStatusUpdated(student, status, block.timestamp);
    }

    function reactivateIdentity(address student) external onlyPanelist {
        if (bytes(addressToCID[student]).length == 0) revert NotRegistered();
        identityStatus[student] = IdentityStatus.ACTIVE;
        uint256 rIdx = revocationIndex[student];
        if (isRevoked(rIdx)) {
            uint256 slot = rIdx / 256;
            uint256 bit  = rIdx % 256;
            revokedSlots[slot] &= ~(1 << bit);
            revokedAt[student] = 0;
        }
        emit IdentityStatusUpdated(student, IdentityStatus.ACTIVE, block.timestamp);
        emit IdentityReactivated(student, block.timestamp);
    }

    // ── Access grants ──────────────────────────────────────────────────────────

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

    function getPanelists() external view returns (address[] memory) {
        return panelistList;
    }

    function panelistCount() external view returns (uint256) {
        return panelistList.length;
    }

    function getCID(address student) external view returns (string memory) {
        return addressToCID[student];
    }

    function getEncryptionPubkey(address student) external view returns (bytes memory) {
        return encryptionPubkeys[student];
    }

    function getIdentityStatus(address student) external view returns (IdentityStatus) {
        return identityStatus[student];
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

    function getProposal(uint256 id) external view returns (
        uint8 pType, uint8 approvals, bool executed, uint64 expiresAt, address proposer, bytes memory data
    ) {
        Proposal storage p = proposals[id];
        return (uint8(p.pType), p.approvals, p.executed, p.expiresAt, p.proposer, p.data);
    }

    function hasVoted(uint256 id, address panelist) external view returns (bool) {
        return proposalVotes[id][panelist];
    }
}
