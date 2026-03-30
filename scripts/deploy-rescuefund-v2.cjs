/**
 * Deploy KLifeRescueFund v2
 * - Token: $6022 (0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5)
 * - Registry: 0x3727c31E01171563d111568FE881648A54e834A7
 * - Oracle: 0x8B3ea7e8eC53596A70019445907645838E945b7a (K's wallet)
 * - Owner: 0x6eE8AaFB926A4e734a2095dD0Bb65d4CB6b79131 (Swiss 6022)
 */
const { ethers } = require('hardhat')

const TOKEN_6022   = '0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5'
const REGISTRY     = '0x3727c31E01171563d111568FE881648A54e834A7'
const ORACLE       = '0x8B3ea7e8eC53596A70019445907645838E945b7a'
const SWISS6022    = '0x6eE8AaFB926A4e734a2095dD0Bb65d4CB6b79131'

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deployer:', deployer.address)
  console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'POL')

  console.log('\n→ Deploying KLifeRescueFund v2...')
  const Fund = await ethers.getContractFactory('KLifeRescueFund')
  const fund = await Fund.deploy(TOKEN_6022, REGISTRY, ORACLE, SWISS6022)
  await fund.waitForDeployment()
  const fundAddr = await fund.getAddress()
  console.log('✅ KLifeRescueFund v2:', fundAddr)
  console.log('   Owner:', await fund.owner())
  console.log('   Token6022:', await fund.token6022())
  console.log('   RESCUE_AMOUNT:', ethers.formatEther(await fund.RESCUE_AMOUNT()), '$6022')
  console.log('   DONATE_BOOST:', (await fund.DONATE_BOOST()).toString(), 'x')

  // Wire registry — setRescueFund
  console.log('\n→ Wiring Registry...')
  const registryAbi = [
    'function setRescueFund(address) external',
    'function rescueFund() external view returns (address)'
  ]
  const registry = new ethers.Contract(REGISTRY, registryAbi, deployer)
  const tx = await registry.setRescueFund(fundAddr)
  await tx.wait()
  console.log('✅ Registry.rescueFund =', await registry.rescueFund())

  console.log('\n═══════════════════════════════════════')
  console.log('KLifeRescueFund v2:', fundAddr)
  console.log('Owner:            ', SWISS6022)
  console.log('═══════════════════════════════════════')
}

main().catch(e => { console.error(e); process.exit(1) })
