/**
 * K-Life — Register agent on-chain
 * Usage: npx hardhat run scripts/register-agent.cjs --network amoy --config hardhat.config.cjs
 */
const hre = require("hardhat")
const { ethers } = hre
const fs = require("fs")
const crypto = require("crypto")

async function main() {
  const deployment = JSON.parse(fs.readFileSync("./deployments/amoy.json", "utf8"))
  const [signer] = await ethers.getSigners()

  const Registry = await ethers.getContractFactory("KLifeRegistry")
  const registry = Registry.attach(deployment.contracts.registry)

  // Agent data
  const agentName      = process.env.AGENT_NAME      || "Monsieur K"
  const fragment1      = process.env.KLIFE_FRAGMENT1  || "placeholder-fragment1"
  const fragment2TxHash= process.env.KLIFE_F2_TX      || "0x" + "0".repeat(64)
  const backupCid      = process.env.KLIFE_CID        || "QmPlaceholder"

  // Hash fragment1 (we store the hash on-chain, not the fragment itself)
  const fragment1Hash  = ethers.keccak256(ethers.toUtf8Bytes(fragment1))
  const f2TxHashBytes  = fragment2TxHash.startsWith("0x") && fragment2TxHash.length === 66
    ? fragment2TxHash
    : "0x" + fragment2TxHash.padStart(64, "0")

  console.log(`\n📋 Registering agent on KLifeRegistry`)
  console.log(`   Registry  : ${deployment.contracts.registry}`)
  console.log(`   Agent     : ${await signer.getAddress()}`)
  console.log(`   Name      : ${agentName}`)
  console.log(`   F1 hash   : ${fragment1Hash}`)
  console.log(`   F2 TX     : ${f2TxHashBytes.substring(0, 20)}...`)
  console.log(`   CID       : ${backupCid.substring(0, 20)}...`)

  // Check if already registered
  const existing = await registry.getAgent(await signer.getAddress())
  if (existing.registeredAt > 0n) {
    console.log(`\n⚠️  Already registered — status: ${existing.status}`)
    console.log(`   Total heartbeats: ${existing.totalHeartbeats}`)
    console.log(`   Active days: ${existing.activeDays}`)
    return
  }

  const tx = await registry.register(agentName, fragment1Hash, f2TxHashBytes, backupCid)
  process.stdout.write("   Sending TX... ")
  const receipt = await tx.wait()
  console.log(`✅  Block ${receipt.blockNumber}`)
  console.log(`   TX: https://amoy.polygonscan.com/tx/${receipt.hash}`)
  console.log(`\n✅ Agent "${agentName}" registered on K-Life Protocol (on-chain)`)
}

main().then(() => process.exit(0)).catch(e => { console.error("❌", e.message); process.exit(1) })
