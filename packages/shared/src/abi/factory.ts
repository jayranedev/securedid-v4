export const FACTORY_ABI = [
  // Write
  "function createRegistry(address[] initialPanelists, uint8 threshold, string name, string website) returns (address)",

  // View
  "function registryCount() view returns (uint256)",
  "function getRegistries() view returns (address[])",
  "function getInstitution(address registry) view returns (string name, string website, uint256 deployedAt, address deployer)",
  "function getInstitutionFull(address registry) view returns (string name, string website, uint256 deployedAt, address deployer, uint8 threshold, uint8 panelistCount)",
  "function getRegistriesPaginated(uint256 offset, uint256 limit) view returns (address[])",
  "function isRegistry(address) view returns (bool)",
  "function usedNames(bytes32) view returns (bool)",
  "function MAX_PANELISTS() view returns (uint8)",

  // Events
  "event RegistryCreated(address indexed registry, address indexed deployer, string name, string website, address[] panelists, uint8 threshold, uint256 timestamp)",

  // Errors
  "error ZeroPanelist()",
  "error DuplicatePanelist()",
  "error NameTaken()",
  "error EmptyName()",
  "error InvalidPanelistCount()",
  "error InvalidThreshold()",
] as const;
