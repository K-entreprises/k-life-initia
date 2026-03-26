const hre = require("hardhat");

async function main() {
  console.log("🚀 K-Life Deployment: Polygon Amoy Testnet\n");

  const [deployer] = await hre.ethers.getSigners();
  const address = await deployer.getAddress();
  const balance = await hre.ethers.provider.getBalance(address);
  console.log(`👤 Deployer: ${address}`);
  console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} POL`);

  if (balance < hre.ethers.parseEther("0.05")) {
    console.log("⚠️  Low balance — run: node scripts/get-polygon-testnet-tokens.js");
    throw new Error("Insufficient balance");
  }

  const KLife = await hre.ethers.getContractFactory("KLifeResurrection");
  console.log("🔨 Deploying KLifeResurrection.sol...");
  const contract = await KLife.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`✅ Deployed at: ${addr}`);

  const hb = await contract.HEARTBEAT_INTERVAL();
  const dt = await contract.DEAD_TIMEOUT();
  console.log(`   HEARTBEAT_INTERVAL: ${hb}s | DEAD_TIMEOUT: ${dt}s`);
  console.log(`🌐 https://amoy.polygonscan.com/address/${addr}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
