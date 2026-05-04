// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { DIDRegistryV6 } from "./DIDRegistryV6.sol";

/**
 * DIDFactory — deploys per-institution DIDRegistryV6 instances.
 *
 * Panelist count (1–10) and vote threshold are chosen at deploy time.
 * Both can be changed later via governance proposals on the registry itself.
 */
contract DIDFactory {

    uint8 public constant MAX_PANELISTS = 10;

    struct InstitutionInfo {
        string   name;
        string   website;
        uint256  deployedAt;
        address  deployer;
        uint8    threshold;
        uint8    panelistCount;
    }

    address[] public registries;
    mapping(address => InstitutionInfo) public institutions;
    mapping(address => bool)            public isRegistry;
    mapping(bytes32 => bool)            public usedNames;

    event RegistryCreated(
        address indexed registry,
        address indexed deployer,
        string          name,
        string          website,
        address[]       panelists,
        uint8           threshold,
        uint256         timestamp
    );

    error ZeroPanelist();
    error DuplicatePanelist();
    error NameTaken();
    error EmptyName();
    error InvalidPanelistCount();
    error InvalidThreshold();

    /**
     * @notice Deploy a new DIDRegistryV6 for an institution.
     * @param initialPanelists  1–10 distinct, non-zero panelist addresses
     * @param threshold         Votes required to execute a proposal (1..N)
     * @param name              Human-readable institution name (must be unique)
     * @param website           Institution homepage URL
     */
    function createRegistry(
        address[] calldata initialPanelists,
        uint8              threshold,
        string    calldata name,
        string    calldata website
    ) external returns (address) {
        uint256 n = initialPanelists.length;
        if (n == 0 || n > MAX_PANELISTS) revert InvalidPanelistCount();
        if (threshold == 0 || threshold > n) revert InvalidThreshold();

        _validatePanelists(initialPanelists);

        if (bytes(name).length == 0) revert EmptyName();
        bytes32 nameHash = keccak256(bytes(name));
        if (usedNames[nameHash]) revert NameTaken();
        usedNames[nameHash] = true;

        DIDRegistryV6 reg = new DIDRegistryV6(initialPanelists, threshold);
        address addr = address(reg);

        registries.push(addr);
        isRegistry[addr] = true;
        institutions[addr] = InstitutionInfo({
            name:         name,
            website:      website,
            deployedAt:   block.timestamp,
            deployer:     msg.sender,
            threshold:    threshold,
            panelistCount: uint8(n)
        });

        emit RegistryCreated(addr, msg.sender, name, website, initialPanelists, threshold, block.timestamp);
        return addr;
    }

    function _validatePanelists(address[] calldata p) internal pure {
        for (uint256 i = 0; i < p.length; i++) {
            if (p[i] == address(0)) revert ZeroPanelist();
            for (uint256 j = i + 1; j < p.length; j++) {
                if (p[i] == p[j]) revert DuplicatePanelist();
            }
        }
    }

    // ── View helpers ───────────────────────────────────────────────────────────

    function registryCount() external view returns (uint256) {
        return registries.length;
    }

    function getRegistries() external view returns (address[] memory) {
        return registries;
    }

    function getInstitution(address registry) external view returns (
        string memory name,
        string memory website,
        uint256 deployedAt,
        address deployer
    ) {
        InstitutionInfo storage info = institutions[registry];
        return (info.name, info.website, info.deployedAt, info.deployer);
    }

    function getInstitutionFull(address registry) external view returns (
        string memory name,
        string memory website,
        uint256 deployedAt,
        address deployer,
        uint8 threshold,
        uint8 panelistCount
    ) {
        InstitutionInfo storage info = institutions[registry];
        return (info.name, info.website, info.deployedAt, info.deployer, info.threshold, info.panelistCount);
    }

    function getRegistriesPaginated(uint256 offset, uint256 limit)
        external view returns (address[] memory page)
    {
        uint256 total = registries.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = registries[i];
        }
    }
}
