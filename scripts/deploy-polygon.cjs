/**
 * K-Life Protocol — Deployment Script
 * Deploys: KLifeRegistry + KLifeVault + KLifeRescueFund
 *
 * Polygon Amoy testnet:  npx hardhat run scripts/deploy-polygon.js --network amoy
 * Polygon mainnet:       npx hardhat run scripts/deploy-polygon.js --network polygon
 *
 * Env vars required:
 *   WALLET_PRIVATE_KEY   Deployer private key
 *   KLIFE_ORACLE_ADDRESS Oracle wallet address (defaults to deployer)
 *
 * Polygon Amoy mock tokens (no real WBTC/USDC on testnet):
 *   Set DEPLOY_MOCK_TOKENS=true to deploy MockERC20 contracts for testing
 */

const hre = require("hardhat")
const { ethers } = hre
const fs = require("fs")

// ── Mainnet token addresses (Polygon PoS) ────────────────────
const MAINNET_TOKENS = {
  wbtc: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",   // WBTC on Polygon
  usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",   // USDC.e on Polygon
}

// ── Amoy mock tokens (deployed by this script if DEPLOY_MOCK_TOKENS=true) ──
// Otherwise uses zero address (for testing without ERC20)

async function deployMockToken(name, symbol, decimals) {
  const Mock = await ethers.getContractFactory("MockERC20")
  const token = await Mock.deploy(name, symbol, decimals)
  await token.waitForDeployment()
  console.log(`   MockERC20 ${symbol}: ${await token.getAddress()}`)
  return await token.getAddress()
}

async function main() {
  const network  = hre.network.name
  const isMainnet = network === "polygon"
  const deployMocks = process.env.DEPLOY_MOCK_TOKENS === "true" || !isMainnet

  console.log(`\n🚀 K-Life Protocol — Deployment`)
  console.log(`   Network  : ${network} ${isMainnet ? "(MAINNET ⚠️)" : "(testnet)"}`)
  console.log(`   Mock ERC20: ${deployMocks ? "yes" : "no (using mainnet tokens)"}`)
  console.log()

  const [deployer] = await ethers.getSigners()
  const deployerAddr = await deployer.getAddress()
  const balance  = await ethers.provider.getBalance(deployerAddr)

  console.log(`   Deployer : ${deployerAddr}`)
  console.log(`   Balance  : ${ethers.formatEther(balance)} MATIC`)

  if (balance < ethers.parseEther("0.02")) {
    throw new Error("Insufficient MATIC — need at least 0.02")
  }

  const oracleAddr = process.env.KLIFE_ORACLE_ADDRESS || deployerAddr
  console.log(`   Oracle   : ${oracleAddr}`)
  console.log()

  // ── 1. Token addresses ────────────────────────────────────
  let wbtcAddr, usdcAddr

  if (isMainnet) {
    wbtcAddr = MAINNET_TOKENS.wbtc
    usdcAddr = MAINNET_TOKENS.usdc
    console.log(`✅ Using mainnet tokens`)
    console.log(`   WBTC: ${wbtcAddr}`)
    console.log(`   USDC: ${usdcAddr}`)
  } else if (deployMocks) {
    console.log(`📦 Deploying mock tokens...`)
    wbtcAddr = await deployMockToken("Wrapped Bitcoin", "WBTC", 8)
    usdcAddr = await deployMockToken("USD Coin", "USDC", 6)
  } else {
    throw new Error("Set DEPLOY_MOCK_TOKENS=true for non-mainnet deployments")
  }
  console.log()

  // ── 2. KLifeRegistry ──────────────────────────────────────
  console.log(`📋 Deploying KLifeRegistry...`)
  const Registry = await ethers.getContractFactory("KLifeRegistry")
  const registry = await Registry.deploy(oracleAddr)
  await registry.waitForDeployment()
  const registryAddr = await registry.getAddress()
  console.log(`   ✅ KLifeRegistry: ${registryAddr}`)

  // ── 3. KLifeVault ─────────────────────────────────────────
  console.log(`🔒 Deploying KLifeVault...`)
  const Vault = await ethers.getContractFactory("KLifeVault")
  const vault = await Vault.deploy(wbtcAddr, usdcAddr, registryAddr, deployerAddr)
  await vault.waitForDeployment()
  const vaultAddr = await vault.getAddress()
  console.log(`   ✅ KLifeVault: ${vaultAddr}`)

  // ── 4. KLifeRescueFund ────────────────────────────────────
  console.log(`💰 Deploying KLifeRescueFund...`)
  const RescueFund = await ethers.getContractFactory("KLifeRescueFund")
  const rescueFund = await RescueFund.deploy(usdcAddr, registryAddr, oracleAddr)
  await rescueFund.waitForDeployment()
  const rescueFundAddr = await rescueFund.getAddress()
  console.log(`   ✅ KLifeRescueFund: ${rescueFundAddr}`)

  // ── 5. Wire contracts ─────────────────────────────────────
  console.log(`\n🔗 Wiring contracts...`)
  let tx

  tx = await registry.setVault(vaultAddr)
  await tx.wait()
  console.log(`   ✅ Registry.vault = ${vaultAddr}`)

  tx = await registry.setRescueFund(rescueFundAddr)
  await tx.wait()
  console.log(`   ✅ Registry.rescueFund = ${rescueFundAddr}`)

  // ── 6. Save deployment addresses ─────────────────────────
  const deployment = {
    network,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    oracle: oracleAddr,
    contracts: {
      registry:    registryAddr,
      vault:       vaultAddr,
      rescueFund:  rescueFundAddr,
    },
    tokens: {
      wbtc: wbtcAddr,
      usdc: usdcAddr,
    }
  }

  const outPath = `./deployments/${network}.json`
  fs.mkdirSync("./deployments", { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2))
  console.log(`\n📄 Deployment saved to ${outPath}`)

  // ── 7. Summary ────────────────────────────────────────────
  const explorer = isMainnet
    ? "https://polygonscan.com"
    : "https://amoy.polygonscan.com"

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 K-Life Protocol deployed on ${network}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  KLifeRegistry  : ${explorer}/address/${registryAddr}
  KLifeVault     : ${explorer}/address/${vaultAddr}
  KLifeRescueFund: ${explorer}/address/${rescueFundAddr}

  WBTC : ${wbtcAddr}
  USDC : ${usdcAddr}

Next:
  1. Fund the Rescue Fund:
     usdc.approve(rescueFund, amount) → rescueFund.donate(amount)
  2. Register first agent:
     registry.register(name, fragment1Hash, fragment2TxHash, cid)
  3. Set production oracle address:
     registry.setOracle(ORACLE_WALLET)
     rescueFund.setOracle(ORACLE_WALLET)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error("\n❌", e.message); process.exit(1) })
