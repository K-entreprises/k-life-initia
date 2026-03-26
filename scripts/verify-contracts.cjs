/**
 * K-Life — Verify contracts on Polygonscan
 *
 * Prerequisites:
 *   1. Get a free API key at https://polygonscan.com/myapikey
 *   2. Set POLYGONSCAN_API_KEY in .env
 *
 * Usage:
 *   npx hardhat run scripts/verify-contracts.cjs --network amoy --config hardhat.config.cjs
 *   npx hardhat run scripts/verify-contracts.cjs --network polygon --config hardhat.config.cjs
 */

const hre = require("hardhat")
const fs  = require("fs")

async function verify(address, constructorArgs) {
  process.stdout.write(`   Verifying ${address.substring(0,12)}... `)
  try {
    await hre.run("verify:verify", { address, constructorArguments: constructorArgs })
    console.log("✅")
  } catch(e) {
    if (e.message.includes("Already Verified")) console.log("✅ (already verified)")
    else console.log(`⚠️  ${e.message.split('\n')[0]}`)
  }
}

async function main() {
  const network    = hre.network.name
  const deployFile = `./deployments/${network === 'polygon' ? 'polygon' : 'amoy'}.json`

  if (!fs.existsSync(deployFile)) {
    throw new Error(`No deployment found for ${network}. Run deploy-polygon.cjs first.`)
  }

  const dep = JSON.parse(fs.readFileSync(deployFile, "utf8"))

  console.log(`\n🔍 Verifying K-Life contracts on ${network}`)
  console.log(`   Deployment: ${dep.deployedAt}`)
  console.log()

  // KLifeRegistry(oracle)
  await verify(dep.contracts.registry, [dep.oracle])

  // KLifeVault(wbtc, usdc, registry, protocolFeeRecipient)
  await verify(dep.contracts.vault, [
    dep.tokens.wbtc,
    dep.tokens.usdc,
    dep.contracts.registry,
    dep.deployer,
  ])

  // KLifeRescueFund(usdc, registry, oracle)
  await verify(dep.contracts.rescueFund, [
    dep.tokens.usdc,
    dep.contracts.registry,
    dep.oracle,
  ])

  // MockERC20 (testnet only)
  if (dep.tokens.wbtc && network !== 'polygon') {
    console.log("   (Skipping MockERC20 verify — testnet only)")
  }

  console.log("\n✅ Verification complete")
  console.log(`   Explorer: https://${network === 'polygon' ? '' : 'amoy.'}polygonscan.com`)
}

main().then(() => process.exit(0)).catch(e => { console.error("❌", e.message); process.exit(1) })
