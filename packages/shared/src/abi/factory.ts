export const FACTORY_ABI = [
  // Write
  "function createRegistry(address[5] initialPanelists, string name, string website) returns (address)",

  // View
  "function registryCount() view returns (uint256)",
  "function getRegistries() view returns (address[])",
  "function getInstitution(address registry) view returns (string name, string website, uint256 deployedAt, address deployer)",
  "function getRegistriesPaginated(uint256 offset, uint256 limit) view returns (address[])",
  "function isRegistry(address) view returns (bool)",
  "function usedNames(bytes32) view returns (bool)",

  // Events
  "event RegistryCreated(address indexed registry, address indexed deployer, string name, string website, address[5] panelists, uint256 timestamp)",

  // Errors
  "error ZeroPanelist()",
  "error DuplicatePanelist()",
  "error NameTaken()",
  "error EmptyName()",
] as const;
