const hre = require("hardhat")
const { ethers } = hre
const fs = require("fs")

async function main() {
  const [deployer] = await ethers.getSigners()
  const addr = await deployer.getAddress()
  const bal  = await ethers.provider.getBalance(addr)

  console.log(`\n🚀 KLifeRegistry — Polygon Amoy`)
  console.log(`   Deployer: ${addr}`)
  console.log(`   Balance : ${ethers.formatEther(bal)} MATIC`)

  const oracle = process.env.KLIFE_ORACLE_ADDRESS || addr
  console.log(`   Oracle  : ${oracle}`)

  const Registry = await ethers.getContractFactory("KLifeRegistry")
  process.stdout.write("   Deploying... ")
  const contract = await Registry.deploy(oracle)
  await contract.waitForDeployment()
  const ca = await contract.getAddress()
  console.log("✅")
  console.log(`\n   KLifeRegistry: ${ca}`)
  console.log(`   https://amoy.polygonscan.com/address/${ca}`)

  fs.mkdirSync("./deployments", { recursive: true })
  const out = { network: "amoy", chainId: "80002", deployedAt: new Date().toISOString(),
    deployer: addr, oracle, contracts: { registry: ca } }
  fs.writeFileSync("./deployments/amoy.json", JSON.stringify(out, null, 2))
  console.log("\n   Saved to deployments/amoy.json")
}

main().then(() => process.exit(0)).catch(e => { console.error("❌", e.message); process.exit(1) })
