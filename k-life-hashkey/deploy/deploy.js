/**
 * Deploy KLifeSoul on HashKey testnet (chainId 133)
 * Usage: node deploy/deploy-soul-hashkey.js
 */
const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')

const RPC       = 'https://testnet.hsk.xyz'
const CHAIN_ID  = 133
const REGISTRY  = '0x1F411bDE1E14F87ba78C852B0987Ab946d15d100'
const PK        = process.env.DEPLOY_PK || '0xdd92c72b7d412e928a31c81613b3e3e5a738822a362832019fd892d9762d1166'

// Compiled bytecode — compile with: npx hardhat compile
// Then paste KLifeSoul.json bytecode here, or use hardhat deploy
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID)
  const wallet   = new ethers.Wallet(PK, provider)
  const bal      = await provider.getBalance(wallet.address)
  console.log('Deployer:', wallet.address)
  console.log('Balance :', ethers.formatEther(bal), 'HSK')

  if (bal < ethers.parseEther('0.01')) {
    console.error('❌ Insufficient HSK. Get testnet tokens at https://hashkeychain.net/faucet')
    console.error('   Deployer address:', wallet.address)
    process.exit(1)
  }

  // Load artifact
  const artifactPath = path.join(__dirname, '../artifacts/contracts/KLifeSoul.sol/KLifeSoul.json')
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Artifact not found. Run: npx hardhat compile first')
    process.exit(1)
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)

  console.log('Deploying KLifeSoul...')
  const contract = await factory.deploy(REGISTRY)
  await contract.waitForDeployment()
  const address = await contract.getAddress()

  console.log('✅ KLifeSoul deployed:', address)
  console.log('   Explorer:', `https://testnet-explorer.hsk.xyz/address/${address}`)

  // Save deployment
  const deployment = {
    network:     'hashkey-testnet',
    chainId:     CHAIN_ID,
    deployedAt:  new Date().toISOString(),
    deployer:    wallet.address,
    contracts: {
      KLifeRegistry: REGISTRY,
      KLifeSoul:     address,
    }
  }
  fs.writeFileSync(
    path.join(__dirname, '../deployments/hashkey.json'),
    JSON.stringify(deployment, null, 2)
  )
  console.log('   Saved to deployments/hashkey.json')
}

main().catch(e => { console.error(e); process.exit(1) })
