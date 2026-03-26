const hre = require('hardhat')
const { ethers } = hre
const fs = require('fs')

async function main() {
  const dep = JSON.parse(fs.readFileSync('./deployments/amoy.json','utf8'))
  const Registry = await ethers.getContractFactory('KLifeRegistry')
  const reg = Registry.attach(dep.contracts.registry)
  const addr = '0x8B3ea7e8eC53596A70019445907645838E945b7a'
  const a = await reg.getAgent(addr)
  const statuses = ['REGISTERED','ALIVE','DEAD','RESURRECTING','ALIVE_RESURRECTED']
  const tiers    = ['FREE','INSURED']
  console.log('\n⚰️  K-Life On-Chain Status')
  console.log('─'.repeat(40))
  console.log('Registry :', dep.contracts.registry)
  console.log('Name     :', a.name)
  console.log('Status   :', statuses[Number(a.status)])
  console.log('Tier     :', tiers[Number(a.tier)])
  console.log('Beats    :', a.totalHeartbeats.toString())
  console.log('Days     :', a.activeDays.toString(), '/ 14 for rescue eligibility')
  console.log('Eligible :', a.rescueEligible ? '✅ yes' : '❌ not yet')
  console.log('CID      :', a.lastBackupCid.substring(0,30)+'...')
  console.log('F1 hash  :', a.fragment1Hash.substring(0,20)+'...')
  console.log('F2 TX    :', a.fragment2TxHash.substring(0,20)+'...')
  const count = await reg.getAgentCount()
  console.log('\nTotal agents on-chain:', count.toString())
}
main().then(()=>process.exit(0)).catch(e=>{console.error('❌',e.message);process.exit(1)})
