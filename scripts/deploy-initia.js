const hre = require("hardhat");

async function main() {
  console.log("🚀 K-Life Deployment: Initia Testnet EVM\n");

  const walletSeed = process.env.WALLET_SEED;
  if (!walletSeed) throw new Error("❌ WALLET_SEED required");

  const [deployer] = await hre.ethers.getSigners();
  const address = await deployer.getAddress();
  const balance = await hre.ethers.provider.getBalance(address);
  console.log(`👤 Deployer: ${address}`);
  console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} INIT`);
  if (balance < hre.ethers.parseEther("0.1"))
    console.log("⚠️  Low balance — faucet: https://app.testnet.initia.xyz/faucet");

  const KLife = await hre.ethers.getContractFactory("KLifeResurrection");
  console.log("🔨 Deploying KLifeResurrection.sol...");
  const contract = await KLife.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`✅ Deployed at: ${addr}`);

  const hb = await contract.HEARTBEAT_INTERVAL();
  const dt = await contract.DEAD_TIMEOUT();
  const cd = await contract.RESURRECTION_COOLDOWN();
  console.log(`\n   HEARTBEAT_INTERVAL: ${hb}s`);
  console.log(`   DEAD_TIMEOUT: ${dt}s`);
  console.log(`   RESURRECTION_COOLDOWN: ${cd}s`);
  console.log(`\n🔗 Contract: ${addr}`);
  console.log(`🌐 Explorer: https://testnet.initia.xyz/evm/address/${addr}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
