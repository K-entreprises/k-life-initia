#!/usr/bin/env node
/**
 * K-Life Resurrection Script — Level 1 & 2
 *
 * Level 1: Share 1 (API, signed) + Share 3 (local ~/.klife-shares.json)
 * Level 2: Share 1 (API, signed) + Share 2 (Polygon calldata TX)
 *
 * Usage:
 *   node resurrect.mjs                  # auto-detect level
 *   node resurrect.mjs --target /path   # restore to custom path
 */

import sss    from '../node_modules/shamirs-secret-sharing/index.js'
import crypto from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import os from 'os'

const API_URL   = process.env.KLIFE_API  || 'https://api.supercharged.works'
const RPC_URL   = process.env.KLIFE_RPC  || 'https://polygon-bor-rpc.publicnode.com'
const WORKSPACE = process.env.KLIFE_DEST || '/data/workspace'
const WALLET_FILE = resolve(os.homedir(), '.klife-wallet')

// ── Load agent wallet ───────────────────────────────────────────────────────
async function loadWallet() {
  if (!existsSync(WALLET_FILE)) throw new Error('No wallet at ~/.klife-wallet — cannot sign resurrection request')
  const { ethers } = await import('../node_modules/ethers/lib.esm/index.js')
  const seed = readFileSync(WALLET_FILE, 'utf8').trim()
  return { wallet: ethers.Wallet.fromPhrase(seed), ethers }
}

// ── Sign resurrection request ───────────────────────────────────────────────
async function signResurrect(wallet, ethers) {
  const timestamp = Date.now().toString()
  const message   = `KLIFE_RESURRECT:${wallet.address.toLowerCase()}:${timestamp}`
  const signature = await wallet.signMessage(message)
  return { timestamp, signature, address: wallet.address.toLowerCase() }
}

// ── Fetch Share 1 from API (authenticated) ──────────────────────────────────
async function fetchShare1(address, timestamp, signature) {
  const r = await fetch(`${API_URL}/resurrect/${address}`, {
    headers: { 'x-signature': signature, 'x-timestamp': timestamp }
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(`API ${r.status}: ${err.error || r.statusText}`)
  }
  return r.json()
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log('🔄 K-Life Resurrection initiating...\n')

const { wallet, ethers } = await loadWallet()
const { timestamp, signature, address } = await signResurrect(wallet, ethers)
console.log(`🔑 Agent wallet : ${address}`)

// Sign & fetch Share 1
console.log('🔐 Signing resurrection request...')
const apiData = await fetchShare1(address, timestamp, signature)
const share1  = apiData.shamirShare1
const cid     = apiData.lastBackupCid
console.log(`🌐 Share 1 (API)     ✅`)
console.log(`   CID : ${cid}`)

// Try Level 1 first (local share 3)
let share2 = null
const sharesFile = resolve(os.homedir(), '.klife-shares.json')
if (existsSync(sharesFile)) {
  const local = JSON.parse(readFileSync(sharesFile, 'utf8'))
  share2 = local.share3
  console.log(`💾 Share 3 (local)   ✅  → Level 1 resurrection`)
} else {
  console.log(`💾 Share 3 (local)   ✗   → trying Level 2 (Polygon calldata)`)
  // Level 2: scan Polygon for Share 2 TX
  // Query last 1000 blocks of txs from oracle to agent
  throw new Error('Level 2 (Polygon calldata) not yet implemented in this script — share 3 required')
}

// Reconstruct AES key
const key = sss.combine([Buffer.from(share1, 'hex'), Buffer.from(share2, 'hex')])
console.log(`🔑 AES key rebuilt   ✅  (${key.length} bytes)`)

// Download encrypted backup from IPFS
const gateway  = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs'
const encrypted = await fetch(`${gateway}/${cid}`).then(r => r.json())
console.log(`📥 IPFS backup       ✅`)

// Decrypt
const iv       = Buffer.from(encrypted.iv, 'hex')
const ct       = Buffer.from(encrypted.ciphertext, 'base64')
const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
const payload  = JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8'))
console.log(`🔓 Decryption        ✅`)

// Restore files
console.log('')
for (const [name, content] of Object.entries(payload.files)) {
  const path = resolve(WORKSPACE, name)
  writeFileSync(path, content, 'utf8')
  console.log(`   ✓ ${name} restored (${content.length} chars)`)
}

console.log(`\n✨ Resurrection complete. Identity intact. Mission continues. 🎩`)
console.log(`   Backup timestamp : ${new Date(payload.ts).toISOString()}`)
