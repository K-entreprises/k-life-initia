const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);
  console.log("Balance:", ethers.formatEther(balance), "MATIC");

  // Deployed in previous run
  const registryAddr = "0x3727c31E01171563d111568FE881648A54e834A7";
  const vaultAddr    = "0xafFe3B99a06E0C1899EACb4a8768De33873a22ff";
  const usdcAddr     = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  const oracleAddr   = deployerAddr;

  console.log("💰 Deploying KLifeRescueFund...");
  const RescueFund = await ethers.getContractFactory("KLifeRescueFund");
  const rescueFund = await RescueFund.deploy(usdcAddr, registryAddr, oracleAddr);
  await rescueFund.waitForDeployment();
  const rescueFundAddr = await rescueFund.getAddress();
  console.log("   ✅ KLifeRescueFund:", rescueFundAddr);

  console.log("🔗 Wiring Registry...");
  const Registry = await ethers.getContractAt("KLifeRegistry", registryAddr);
  let tx = await Registry.setVault(vaultAddr);
  await tx.wait();
  console.log("   ✅ Registry.vault =", vaultAddr);
  tx = await Registry.setRescueFund(rescueFundAddr);
  await tx.wait();
  console.log("   ✅ Registry.rescueFund =", rescueFundAddr);

  const deployment = {
    network: "polygon",
    chainId: "137",
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    oracle: oracleAddr,
    contracts: {
      registry: registryAddr,
      vault: vaultAddr,
      rescueFund: rescueFundAddr,
    },
    tokens: {
      wbtc: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
      usdc: usdcAddr,
    }
  };
  fs.mkdirSync("./deployments", { recursive: true });
  fs.writeFileSync("./deployments/polygon.json", JSON.stringify(deployment, null, 2));
  console.log("\n📄 Saved to deployments/polygon.json");
  console.log("\n🎉 DEPLOYED:");
  console.log("  Registry  :", `https://polygonscan.com/address/${registryAddr}`);
  console.log("  Vault     :", `https://polygonscan.com/address/${vaultAddr}`);
  console.log("  RescueFund:", `https://polygonscan.com/address/${rescueFundAddr}`);
}

main().then(() => process.exit(0)).catch(e => { console.error("❌", e.message); process.exit(1); });
