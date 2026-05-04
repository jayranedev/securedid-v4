// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { DIDRegistryV6 } from "./DIDRegistryV6.sol";

/**
 * DIDFactory — deploys per-institution DIDRegistryV6 instances (Safe-style).
 *
 * Every institution gets its own isolated registry with independent panelists,
 * enrollments, and revocations. The factory tracks all deployments so explorers
 * and portals can discover them.
 */
contract DIDFactory {

    struct InstitutionInfo {
        string   name;         // "Don Bosco College of Engineering"
        string   website;      // "https://dbce.edu"
        uint256  deployedAt;
        address  deployer;
    }

    address[] public registries;
    mapping(address => InstitutionInfo) public institutions;
    mapping(address => bool)            public isRegistry;
    mapping(bytes32 => bool)            public usedNames;  // keccak256(name) → taken

    event RegistryCreated(
        address indexed registry,
        address indexed deployer,
        string          name,
        string          website,
        address[5]      panelists,
        uint256         timestamp
    );

    error ZeroPanelist();
    error DuplicatePanelist();
    error NameTaken();
    error EmptyName();

    /**
     * @notice Deploy a new DIDRegistryV6 for an institution.
     * @param initialPanelists  5 distinct, non-zero addresses
     * @param name              Human-readable institution name
     * @param website           Institution homepage URL
     */
    function createRegistry(
        address[5] calldata initialPanelists,
        string   calldata name,
        string   calldata website
    ) external returns (address) {
        _validatePanelists(initialPanelists);

        if (bytes(name).length == 0) revert EmptyName();
        bytes32 nameHash = keccak256(bytes(name));
        if (usedNames[nameHash]) revert NameTaken();
        usedNames[nameHash] = true;

        DIDRegistryV6 reg = new DIDRegistryV6(initialPanelists);
        address addr = address(reg);

        registries.push(addr);
        isRegistry[addr] = true;
        institutions[addr] = InstitutionInfo({
            name:       name,
            website:    website,
            deployedAt: block.timestamp,
            deployer:   msg.sender
        });

        emit RegistryCreated(addr, msg.sender, name, website, initialPanelists, block.timestamp);
        return addr;
    }

    function _validatePanelists(address[5] calldata p) internal pure {
        for (uint256 i = 0; i < 5; i++) {
            if (p[i] == address(0)) revert ZeroPanelist();
            for (uint256 j = i + 1; j < 5; j++) {
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

    /**
     * @notice Paginated listing so the explorer doesn't load 10k registries in one call.
     */
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
