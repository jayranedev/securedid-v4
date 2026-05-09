// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDIDRegistryV6 {
    function isPanelist(address addr) external view returns (bool);
    function threshold() external view returns (uint8);
    function getIdentityStatus(address student) external view returns (uint8);
    function getCID(address student) external view returns (string memory);
}

contract VerificationAccessManager {
    // Must match DIDRegistryV6.IdentityStatus ordering.
    uint8 private constant STATUS_REVOKED = 3;

    struct AccessRequest {
        address requester;
        address student;
        address registry;
        uint40  createdAt;
        uint40  expiry;
        uint8   approvals;
        bool    studentApproved;
        bool    active;
        bool    revoked;
    }

    uint256 public nextRequestId = 1;
    mapping(uint256 => AccessRequest) public requests;
    mapping(uint256 => mapping(address => bool)) public universityVotes;

    event AccessRequested(uint256 indexed id, address indexed requester, address indexed student, address registry);
    event StudentApproved(uint256 indexed id, address indexed student, uint256 expiry);
    event UniversityApproved(uint256 indexed id, address indexed panelist, uint8 approvals);
    event AccessActivated(uint256 indexed id, uint256 expiry);
    event AccessRevoked(uint256 indexed id, address indexed revokedBy);

    error RequestNotFound();
    error NotStudent();
    error NotPanelist();
    error AlreadyApproved();
    error InvalidDuration();
    error RequestRevoked();
    error RequestExpired();
    error InvalidRegistry();
    error StudentRevoked();
    error StudentNotIssued();

    function createRequest(address registry, address student) external returns (uint256) {
        if (registry == address(0) || student == address(0)) revert InvalidRegistry();
        uint8 status = IDIDRegistryV6(registry).getIdentityStatus(student);
        if (status == STATUS_REVOKED) revert StudentRevoked();
        if (bytes(IDIDRegistryV6(registry).getCID(student)).length == 0) revert StudentNotIssued();

        uint256 id = nextRequestId++;
        requests[id] = AccessRequest({
            requester: msg.sender,
            student: student,
            registry: registry,
            createdAt: uint40(block.timestamp),
            expiry: 0,
            approvals: 0,
            studentApproved: false,
            active: false,
            revoked: false
        });
        emit AccessRequested(id, msg.sender, student, registry);
        return id;
    }

    function approveByStudent(uint256 id, uint256 durationSeconds) external {
        AccessRequest storage r = requests[id];
        if (r.requester == address(0)) revert RequestNotFound();
        if (r.student != msg.sender) revert NotStudent();
        if (r.revoked) revert RequestRevoked();
        if (durationSeconds == 0) revert InvalidDuration();

        r.studentApproved = true;
        r.expiry = uint40(block.timestamp + durationSeconds);
        emit StudentApproved(id, msg.sender, r.expiry);
        _maybeActivate(id, r);
    }

    function approveByUniversity(uint256 id) external {
        AccessRequest storage r = requests[id];
        if (r.requester == address(0)) revert RequestNotFound();
        if (r.revoked) revert RequestRevoked();
        if (r.expiry != 0 && block.timestamp > r.expiry) revert RequestExpired();
        if (!IDIDRegistryV6(r.registry).isPanelist(msg.sender)) revert NotPanelist();
        if (universityVotes[id][msg.sender]) revert AlreadyApproved();

        universityVotes[id][msg.sender] = true;
        r.approvals++;
        emit UniversityApproved(id, msg.sender, r.approvals);
        _maybeActivate(id, r);
    }

    function revokeAccess(uint256 id) external {
        AccessRequest storage r = requests[id];
        if (r.requester == address(0)) revert RequestNotFound();
        if (msg.sender != r.student && !IDIDRegistryV6(r.registry).isPanelist(msg.sender)) revert NotPanelist();
        r.revoked = true;
        r.active = false;
        emit AccessRevoked(id, msg.sender);
    }

    function isRequestActive(uint256 id) public view returns (bool) {
        AccessRequest storage r = requests[id];
        if (r.requester == address(0)) return false;
        if (!r.studentApproved || r.revoked || r.expiry == 0) return false;
        if (block.timestamp > r.expiry) return false;
        uint8 threshold = IDIDRegistryV6(r.registry).threshold();
        return r.approvals >= threshold;
    }

    function hasUniversityApproved(uint256 id, address panelist) external view returns (bool) {
        return universityVotes[id][panelist];
    }

    function getRequest(uint256 id) external view returns (AccessRequest memory) {
        return requests[id];
    }

    function _maybeActivate(uint256 id, AccessRequest storage r) internal {
        if (r.active || r.revoked || !r.studentApproved || r.expiry == 0) return;
        if (block.timestamp > r.expiry) return;
        uint8 threshold = IDIDRegistryV6(r.registry).threshold();
        if (r.approvals < threshold) return;
        r.active = true;
        emit AccessActivated(id, r.expiry);
    }
}
