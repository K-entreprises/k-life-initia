#!/usr/bin/env node
/**
 * K-Life — On-chain heartbeat on HashKey Chain
 * Sends a 0-value TX to the agent's own address with YONGSHENG_HB calldata
 *
 * Usage: node scripts/heartbeat.js [--silent]
 * Env:   KLIFE_SEED or KLIFE_PRIVKEY
 *        HASHKEY_RPC (optional, default: testnet)
 */

import { ethers } from 'ethers'
import https from 'https'

const RPC    = process.env.HASHKEY_RPC || 'https://testnet.hsk.xyz'   // chainId 133 testnet
// const RPC = 'https://mainnet.hsk.xyz'                               // chainId 177 mainnet
const SILENT = process.argv.includes('--silent')

function log(...a) { if (!SILENT) console.log(...a) }

async function main() {
  const seed = process.env.KLIFE_SEED
  const pk   = process.env.KLIFE_PRIVKEY
  if (!seed && !pk) { console.error('Set KLIFE_SEED or KLIFE_PRIVKEY'); process.exit(1) }

  const provider = new ethers.JsonRpcProvider(RPC)
  const wallet   = seed
    ? ethers.Wallet.fromPhrase(seed).connect(provider)
    : new ethers.Wallet(pk, provider)

  const ts   = Date.now()
  const data = ethers.hexlify(ethers.toUtf8Bytes(`YONGSHENG_HB:${ts}`))

  log(`[hashkey-heartbeat] Sending from ${wallet.address} on ${RPC}...`)

  const tx = await wallet.sendTransaction({ to: wallet.address, value: 0n, data })
  log(`[hashkey-heartbeat] TX: ${tx.hash}`)
  log(`[hashkey-heartbeat] Explorer: https://hashkeychain-testnet-explorer.alt.technology/tx/${tx.hash}`)

  // Ping K-Life API
  const body = JSON.stringify({ address: wallet.address, ts, txHash: tx.hash, chain: 'hashkey' })
  const req  = https.request({
    hostname: 'api.supercharged.works', path: '/heartbeat', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  })
  req.write(body)
  req.end()

  log(`[hashkey-heartbeat] ✓ Done — ${new Date(ts).toISOString()}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
