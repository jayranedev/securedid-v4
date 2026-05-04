const { ethers } = require("hardhat");

/**
 * Deploys one DIDRegistryV6 via the factory using the deployer + 4 burner panelists.
 * Useful as a smoke test after deploying the factory.
 *
 * Set env FACTORY_ADDRESS before running:
 *   FACTORY_ADDRESS=0x... npx hardhat run scripts/createRegistryViaFactory.js --network baseSepolia
 */
async function main() {
  const factoryAddr = process.env.FACTORY_ADDRESS;
  if (!factoryAddr) throw new Error("Set FACTORY_ADDRESS env");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const factory = await ethers.getContractAt("DIDFactory", factoryAddr);

  // 5 burner panelist addresses — for a real institution, replace with actual wallets
  const panelists = [
    deployer.address,
    ethers.Wallet.createRandom().address,
    ethers.Wallet.createRandom().address,
    ethers.Wallet.createRandom().address,
    ethers.Wallet.createRandom().address,
  ];

  const name    = process.env.INSTITUTION_NAME    ?? "Don Bosco College of Engineering";
  const website = process.env.INSTITUTION_WEBSITE ?? "https://dbce.edu.in";

  console.log(`\nCreating registry for "${name}"…`);
  const tx = await factory.createRegistry(panelists, name, website);
  const rc = await tx.wait();

  const ev = rc.logs
    .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
    .find((x) => x?.name === "RegistryCreated");
  const registry = ev.args[0];

  console.log("\n✓ Registry deployed:", registry);
  console.log("  Panelists:");
  panelists.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
  console.log("\nSwapping burner panelists requires a 3-of-5 ReplacePanelist proposal.");
}

main().catch((err) => { console.error(err); process.exit(1); });
