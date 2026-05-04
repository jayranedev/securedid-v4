export const REGISTRY_V6_ABI = [
  // Student lifecycle
  "function registerStudent(string metadataHash, bytes32 commitment, bytes encPubkey)",
  "function approveStudent(address student, string cid)",

  // Proposals — create
  "function proposeReplacePanelist(uint8 slotIndex, address newPanelist) returns (uint256)",
  "function proposeEnrollment(bytes32 commitment) returns (uint256)",
  "function proposeRevocation(address student, string reason) returns (uint256)",
  "function proposeChangeThreshold(uint8 newThreshold) returns (uint256)",
  "function proposeAddPanelist(address newPanelist) returns (uint256)",
  "function proposeRemovePanelist(address panelistAddr) returns (uint256)",

  // Proposals — vote / query
  "function approveProposal(uint256 proposalId)",
  "function nextProposalId() view returns (uint256)",
  "function getProposal(uint256 id) view returns (uint8 pType, uint8 approvals, bool executed, uint64 expiresAt, address proposer, bytes data)",
  "function hasVoted(uint256 proposalId, address panelist) view returns (bool)",

  // Panelist management (view)
  "function isPanelist(address addr) view returns (bool)",
  "function getPanelists() view returns (address[])",
  "function panelistCount() view returns (uint256)",
  "function threshold() view returns (uint8)",

  // Access grants
  "function grantAccess(address platform, uint256 ttlSeconds)",
  "function revokeAccess(address platform)",
  "function hasAccess(address student, address platform) view returns (bool)",

  // Views
  "function getCID(address student) view returns (string)",
  "function getEncryptionPubkey(address student) view returns (bytes)",
  "function isStudentRevoked(address student) view returns (bool)",
  "function isRevoked(uint256 rIdx) view returns (bool)",
  "function isEnrollmentAuthorized(bytes32 commitment) view returns (bool)",
  "function revocationIndex(address) view returns (uint256)",
  "function revokedAt(address) view returns (uint256)",
  "function approvalCount(address) view returns (uint8)",
  "function pendingRegistration(address) view returns (bool)",
  "function nextRevocationIndex() view returns (uint256)",

  // Custom errors
  "error NoActiveCID()",
  "error AlreadyRevoked()",
  "error NotPanelist()",
  "error AlreadyPanelist()",
  "error AlreadyVoted()",
  "error ProposalNotFound()",
  "error ProposalAlreadyExecuted()",
  "error ProposalExpired()",
  "error InvalidSlot()",
  "error DuplicatePanelist()",
  "error NotRegistered()",
  "error AlreadyIssued()",
  "error AlreadyApproved()",
  "error NotAuthorized()",
  "error InvalidInitialPanelists()",
  "error MaxPanelistsReached()",
  "error ThresholdViolation()",
  "error InvalidThreshold()",

  // Events
  "event StudentRegistered(address indexed student, bytes32 indexed commitment, string metadataHash, uint256 timestamp)",
  "event EncryptionKeyPublished(address indexed student, bytes pubkey)",
  "event DIDIssued(address indexed student, string cid, uint256 revocationIndex, uint256 timestamp)",
  "event RegistrationApproved(address indexed student, address indexed panelist, uint8 approvalCount)",
  "event CredentialRevoked(address indexed student, uint256 revocationIndex, string reason, uint256 timestamp)",
  "event AccessGranted(address indexed student, address indexed platform, uint256 expiresAt)",
  "event AccessRevoked(address indexed student, address indexed platform, uint256 timestamp)",
  "event ProposalCreated(uint256 indexed id, uint8 pType, address indexed proposer)",
  "event ProposalApproved(uint256 indexed id, address indexed panelist, uint8 approvals)",
  "event ProposalExecuted(uint256 indexed id)",
  "event PanelistReplaced(uint8 indexed slot, address indexed oldAddr, address indexed newAddr)",
  "event PanelistAdded(address indexed newPanelist)",
  "event PanelistRemoved(address indexed removedPanelist)",
  "event ThresholdChanged(uint8 oldThreshold, uint8 newThreshold)",
  "event EnrollmentAuthorized(bytes32 indexed commitment)",
] as const;
