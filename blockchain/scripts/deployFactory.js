const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DIDFactory with:", deployer.address);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "ETH");

  const F = await ethers.getContractFactory("DIDFactory");
  const factory = await F.deploy();
  await factory.waitForDeployment();
  const addr = await factory.getAddress();

  console.log("\n✓ DIDFactory deployed to:", addr);
  console.log("\n─── Paste into apps/factory/.env.local ───");
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${addr}`);
  console.log("─────────────────────────────────────────\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
