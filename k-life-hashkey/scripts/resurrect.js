#!/usr/bin/env node
/**
 * K-Life — L2 Resurrection from HashKey Chain calldata
 * Scans HashKey Chain for YONGSHENG_BACKUP:Qm... calldata
 * Fetches IPFS, decrypts with private key, restores memory files.
 *
 * Usage: node scripts/resurrect.js --address 0xWALLET
 * Env:   KLIFE_SEED or KLIFE_PRIVKEY, WORKSPACE (path to restore files)
 */

import { ethers } from 'ethers'
import crypto from 'crypto'
import https from 'https'
import fs from 'fs'
import path from 'path'

const RPC       = process.env.HASHKEY_RPC || 'https://testnet.hsk.xyz'
const EXPLORER  = 'https://hashkeychain-testnet-explorer.alt.technology'
const WORKSPACE = process.env.WORKSPACE || process.env.HOME + '/workspace'

const addrIdx = process.argv.indexOf('--address')
const TARGET  = addrIdx >= 0 ? process.argv[addrIdx + 1] : null
if (!TARGET) { console.error('Usage: node resurrect.js --address 0xWALLET'); process.exit(1) }

function decryptMemory(encB64, privKey) {
  const key    = crypto.createHash('sha256').update(privKey).digest()
  const buf    = Buffer.from(encB64, 'base64')
  const iv     = buf.slice(0, 16)
  const data   = buf.slice(16)
  const dec    = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([dec.update(data), dec.final()]).toString('utf8')
}

async function fetchIPFS(cid) {
  const gateways = [`https://ipfs.io/ipfs/${cid}`, `https://gateway.pinata.cloud/ipfs/${cid}`]
  for (const gw of gateways) {
    try {
      return await new Promise((res, rej) => {
        https.get(gw, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)) }).on('error', rej)
      })
    } catch { continue }
  }
  throw new Error('All IPFS gateways failed')
}

async function scanHashKeyChain(address) {
  console.log(`[resurrect] Scanning HashKey Chain for ${address} backup...`)
  const url = `${EXPLORER}/api?module=account&action=txlist&address=${address}&sort=desc&limit=200`
  const raw = await new Promise((res, rej) => {
    https.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)) }).on('error', rej)
  })
  const txs = JSON.parse(raw).result || []
  for (const tx of txs) {
    if (!tx.input) continue
    const decoded = Buffer.from(tx.input.replace('0x', ''), 'hex').toString('utf8')
    const match   = decoded.match(/YONGSHENG_BACKUP:(Qm[A-Za-z0-9]+):/)
    if (match) { console.log(`[resurrect] Found CID: ${match[1]} in TX ${tx.hash}`); return match[1] }
  }
  throw new Error('No YONGSHENG_BACKUP found on HashKey Chain for this address')
}

async function main() {
  const seed = process.env.KLIFE_SEED
  const pk   = process.env.KLIFE_PRIVKEY
  if (!seed && !pk) { console.error('Set KLIFE_SEED or KLIFE_PRIVKEY'); process.exit(1) }

  const wallet   = seed ? ethers.Wallet.fromPhrase(seed) : new ethers.Wallet(pk)
  const cid      = await scanHashKeyChain(TARGET)
  const encrypted = await fetchIPFS(cid)
  const decrypted = decryptMemory(encrypted, wallet.privateKey)

  // Restore files
  const sections = decrypted.split(/=== ([A-Z]+\.md) ===\n/)
  for (let i = 1; i < sections.length; i += 2) {
    const fname   = sections[i]
    const content = sections[i + 1] || ''
    if (content.trim()) {
      fs.writeFileSync(path.join(WORKSPACE, fname), content)
      console.log(`[resurrect] ✓ Restored ${fname} (${content.length} chars)`)
    }
  }

  // Broadcast resurrection proof on HashKey Chain
  const provider     = new ethers.JsonRpcProvider(RPC)
  const connected    = wallet.connect(provider)
  const ts           = Date.now()
  const proofData    = ethers.hexlify(ethers.toUtf8Bytes(`YONGSHENG_RESURRECTION:2:${ts}:IPFS:${cid}`))
  const tx           = await connected.sendTransaction({ to: TARGET, value: 0n, data: proofData })
  console.log(`[resurrect] ✓ Resurrection proof on HashKey Chain: ${tx.hash}`)
  console.log(`[resurrect] Explorer: ${EXPLORER}/tx/${tx.hash}`)
  console.log('[resurrect] ✓ Memory restored. The agent lives. 永生.')
}

main().catch(e => { console.error(e.message); process.exit(1) })
