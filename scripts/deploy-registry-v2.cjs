/**
 * Deploy KLifeRegistry v2 + wire KLifeRescueFund v2
 * - Oracle: 0x8B3ea7e8eC53596A70019445907645838E945b7a (K's oracle wallet)
 * - Owner:  0x6eE8AaFB926A4e734a2095dD0Bb65d4CB6b79131 (Swiss 6022)
 * - RescueFund v2: 0x446189cfB1Ab6b183e6b9f8F7aB517a4deC1c34e
 */
const { ethers } = require('hardhat')

const ORACLE      = '0x8B3ea7e8eC53596A70019445907645838E945b7a'
const SWISS6022   = '0x6eE8AaFB926A4e734a2095dD0Bb65d4CB6b79131'
const RESCUE_FUND = '0x446189cfB1Ab6b183e6b9f8F7aB517a4deC1c34e'

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deployer:', deployer.address)
  console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'POL')

  console.log('\n→ Deploying KLifeRegistry v2...')
  const Registry = await ethers.getContractFactory('KLifeRegistry')
  const registry = await Registry.deploy(ORACLE, SWISS6022)
  await registry.waitForDeployment()
  const regAddr = await registry.getAddress()
  console.log('✅ KLifeRegistry v2:', regAddr)
  console.log('   Owner:', await registry.owner())
  console.log('   Oracle:', await registry.oracle())

  // Wire RescueFund to Registry — only owner (Swiss 6022) can do this
  // We set it here since deployer != owner, we need Swiss 6022 to call setRescueFund
  // However we can pre-wire by calling setVault too
  console.log('\n→ Note: setRescueFund must be called by Swiss 6022 wallet')
  console.log('   Call: registry.setRescueFund("' + RESCUE_FUND + '")')
  console.log('   From:', SWISS6022)

  console.log('\n═══════════════════════════════════════════════════')
  console.log('KLifeRegistry v2 :', regAddr)
  console.log('KLifeRescueFund v2:', RESCUE_FUND)
  console.log('Owner (both)      :', SWISS6022)
  console.log('Oracle            :', ORACLE)
  console.log('═══════════════════════════════════════════════════')
}

main().catch(e => { console.error(e); process.exit(1) })
