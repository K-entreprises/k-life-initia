const { ethers } = require('hardhat')

const OWNER   = '0x2b6Ce1e2bE4032DF774d3453358DA4D0d79c8C80'  // K-Life wallet (provisoire)
const ORACLE  = '0x2b6Ce1e2bE4032DF774d3453358DA4D0d79c8C80'  // même wallet pour l'instant
const TOKEN6022 = '0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5'

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deployer:', deployer.address)
  console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'POL')

  // Registry
  console.log('\n→ KLifeRegistry...')
  const Registry = await ethers.getContractFactory('KLifeRegistry')
  const registry = await Registry.deploy(ORACLE, OWNER)
  await registry.waitForDeployment()
  const regAddr = await registry.getAddress()
  console.log('✅ Registry:', regAddr)

  // RescueFund
  console.log('\n→ KLifeRescueFund v2...')
  const Fund = await ethers.getContractFactory('KLifeRescueFund')
  const fund = await Fund.deploy(TOKEN6022, regAddr, ORACLE, OWNER)
  await fund.waitForDeployment()
  const fundAddr = await fund.getAddress()
  console.log('✅ RescueFund:', fundAddr)

  // Wire — deployer != owner donc on skip, note pour Arnaud
  console.log('\n→ setRescueFund doit être appelé depuis', OWNER)
  console.log('   registry.setRescueFund("' + fundAddr + '")')

  console.log('\n══════════════════════════════════════════════')
  console.log('Registry  :', regAddr)
  console.log('RescueFund:', fundAddr)
  console.log('Owner     :', OWNER)
  console.log('══════════════════════════════════════════════')
}

main().catch(e => { console.error(e); process.exit(1) })
