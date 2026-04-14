#!/usr/bin/env node
/**
 * K-Life — Register agent on KLifeRegistry (HashKey Chain)
 *
 * Usage: node scripts/register.js --name "MyAgent"
 * Env:   KLIFE_SEED or KLIFE_PRIVKEY, HASHKEY_RPC
 */

import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RPC       = process.env.HASHKEY_RPC || 'https://testnet.hsk.xyz'

const DEPLOYMENT = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../deployments/hashkey.json'), 'utf8')
)
const REGISTRY_ADDR = DEPLOYMENT.contracts.KLifeRegistry

const REGISTRY_ABI = [
  'function register(string name, bytes32 fragment1Hash, bytes32 fragment2TxHash, string ipfsCid) external',
  'function getAgent(address) external view returns (tuple(address wallet, string name, uint8 tier, uint8 status, uint256 registeredAt, uint256 lastHeartbeat, uint256 totalHeartbeats, uint256 activeDays, uint256 deadAt, uint256 resurrectionCount, uint256 resurrectionInitiatedAt, bytes32 fragment1Hash, bytes32 fragment2TxHash, string lastBackupCid, uint256 lastBackupTs, bool rescueEligible))',
]

async function main() {
  const nameIdx = process.argv.indexOf('--name')
  const name    = nameIdx >= 0 ? process.argv[nameIdx + 1] : 'Agent'
  const seed    = process.env.KLIFE_SEED
  const pk      = process.env.KLIFE_PRIVKEY
  if (!seed && !pk) { console.error('Set KLIFE_SEED or KLIFE_PRIVKEY'); process.exit(1) }

  const provider = new ethers.JsonRpcProvider(RPC)
  const wallet   = seed
    ? ethers.Wallet.fromPhrase(seed).connect(provider)
    : new ethers.Wallet(pk, provider)

  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, wallet)

  // Send registration calldata on-chain first (YONGSHENG_REGISTER)
  const ts       = Date.now()
  const regData  = ethers.hexlify(ethers.toUtf8Bytes(`YONGSHENG_REGISTER:${wallet.address}:${ts}`))
  const regTx    = await wallet.sendTransaction({ to: wallet.address, value: 0n, data: regData })
  console.log(`[register] YONGSHENG_REGISTER TX: ${regTx.hash}`)

  // Register on KLifeRegistry contract
  const tx = await registry.register(
    name,
    ethers.ZeroHash,  // fragment1Hash — provided by K-Life API after POST /register
    ethers.ZeroHash,  // fragment2TxHash — set after first backup
    ''                // ipfsCid — set after first backup
  )
  await tx.wait()
  console.log(`[register] ✓ Registered "${name}" on KLifeRegistry`)
  console.log(`[register] Address: ${wallet.address}`)
  console.log(`[register] Registry: ${REGISTRY_ADDR} (HashKey ${DEPLOYMENT.network})`)
  console.log(`[register] Explorer: https://hashkeychain-testnet-explorer.alt.technology/address/${REGISTRY_ADDR}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
