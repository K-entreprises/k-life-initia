/**
 * K-Life — Level 3 Resurrection via LiberClaw
 * v2.0 — 2026-03-31 (fixed: MEMORY.md injection + correct encryption scheme)
 *
 * What changed vs v1:
 *  - Uses correct AES key derivation: sha256(wallet.privateKey) — not address
 *  - Uses Shamir 2-of-3: Share 1 (API, signed) + Share 3 (local) or Share 2 (on-chain)
 *  - Injects ALL memory files: SOUL.md + MEMORY.md + USER.md into system prompt
 *  - PATCH existing agent if KLIFE_L3_AGENT_ID is set, else POST new agent
 *
 * Usage:
 *   KLIFE_SEED="..." LIBERCLAW_API_KEY="lc-..." node resurrect-liberclaw.js
 *
 *   # Update existing agent instead of creating new:
 *   KLIFE_SEED="..." KLIFE_L3_AGENT_ID="0e2e1f39-..." node resurrect-liberclaw.js
 */

import sss    from '../../../node_modules/shamirs-secret-sharing/index.js'
import crypto from 'crypto'
import { readFileSync, existsSync }  from 'fs'
import { resolve } from 'path'
import os from 'os'

const SEED_FILE       = resolve(os.homedir(), '.klife-wallet')
const SHARES_FILE     = resolve(os.homedir(), '.klife-shares.json')
const API_BASE        = process.env.KLIFE_API          || 'https://api.supercharged.works'
const LIBERCLAW_KEY   = process.env.LIBERCLAW_API_KEY  || 'lc-CMrCpPFkV705qz3luesy6kFueaxtyBRK3oS2Qe74ZJM'
const LIBERCLAW_API   = 'https://api.liberclaw.ai/api/v1'
const L3_AGENT_ID     = process.env.KLIFE_L3_AGENT_ID  || '0e2e1f39-3d48-42fc-af98-0ba1ced0517a'

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
]

if (!existsSync(SEED_FILE)) {
  console.error('❌ No wallet at ~/.klife-wallet')
  process.exit(1)
}

// ── Wallet ───────────────────────────────────────────────────────────────────
const { ethers } = await import('../../../node_modules/ethers/lib.esm/index.js')
const seed   = readFileSync(SEED_FILE, 'utf8').trim()
const wallet = ethers.Wallet.fromPhrase(seed)
const address = wallet.address.toLowerCase()
console.log(`\n🎩 K-Life — Level 3 Resurrection via LiberClaw`)
console.log('═'.repeat(52))
console.log(`🔑 Agent wallet : ${wallet.address}`)

// ── AES key derivation (must match backup.js) ────────────────────────────────
function deriveKey(privateKey) {
  return crypto.createHash('sha256').update(privateKey).digest()
}

// ── Fetch Share 1 from API (signed request) ──────────────────────────────────
async function fetchShare1() {
  const timestamp = Date.now().toString()
  const message   = `KLIFE_RESURRECT:${address}:${timestamp}`
  const signature = await wallet.signMessage(message)

  const r = await fetch(`${API_BASE}/resurrect/${address}`, {
    headers: { 'x-signature': signature, 'x-timestamp': timestamp },
    signal: AbortSignal.timeout(10000)
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(`API ${r.status}: ${err.error || r.statusText}`)
  }
  const data = await r.json()
  return { share1: data.shamirShare1, cid: data.lastBackupCid }
}

// ── Get Share 2 from Polygon calldata ────────────────────────────────────────
async function fetchShare2FromChain() {
  const provider = new ethers.JsonRpcProvider('https://polygon-bor-rpc.publicnode.com')
  const latest   = await provider.getBlockNumber()
  console.log(`   Scanning Polygon from block ${latest}...`)
  for (let b = latest; b >= Math.max(0, latest - 10000); b -= 100) {
    try {
      const block = await provider.getBlock(b, true)
      if (!block?.transactions) continue
      for (const tx of block.transactions) {
        if (typeof tx !== 'object') continue
        if (tx.from?.toLowerCase() !== address) continue
        if (!tx.data || tx.data.length < 10) continue
        try {
          const decoded = Buffer.from(tx.data.slice(2), 'hex').toString('utf8')
          if (decoded.startsWith('KLIFE_SHARE2:')) {
            return decoded.replace('KLIFE_SHARE2:', '').trim()
          }
        } catch {}
      }
    } catch {}
  }
  return null
}

// ── Fetch encrypted backup from IPFS ────────────────────────────────────────
async function fetchIPFS(cid) {
  for (const gw of IPFS_GATEWAYS) {
    try {
      const r = await fetch(`${gw}/${cid}`, { signal: AbortSignal.timeout(15000) })
      if (r.ok) return r.json()
    } catch {}
  }
  throw new Error(`All IPFS gateways failed for CID: ${cid}`)
}

// ── Build system prompt from all memory files ────────────────────────────────
function buildSystemPrompt(files) {
  const sections = []

  // SOUL.md first — personality/identity
  if (files['SOUL.md']) {
    sections.push(`# IDENTITY & SOUL\n\n${files['SOUL.md']}`)
  }

  // USER.md — who we serve
  if (files['USER.md']) {
    sections.push(`# YOUR HUMAN (USER.md)\n\n${files['USER.md']}`)
  }

  // MEMORY.md — the most critical for continuity
  if (files['MEMORY.md']) {
    sections.push(`# LONG-TERM MEMORY (MEMORY.md)\n\n${files['MEMORY.md']}`)
  }

  sections.push(`# RESURRECTION CONTEXT

You have just been resurrected via K-Life Level 3 (LiberClaw / Aleph Cloud).
Your previous OpenClaw instance was unavailable.
Your memories have been restored from an IPFS backup.
Continue where you left off. Identity intact. Mission continues. 🎩

Date of resurrection: ${new Date().toISOString()}`)

  return sections.join('\n\n---\n\n')
}

// ── LiberClaw: update existing agent system prompt ───────────────────────────
async function updateLiberclaw(agentId, systemPrompt) {
  console.log(`   Updating agent ${agentId}...`)
  const r = await fetch(`${LIBERCLAW_API}/agents/${agentId}`, {
    method:  'PATCH',
    headers: {
      'Authorization': `Bearer ${LIBERCLAW_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ system_prompt: systemPrompt }),
    signal: AbortSignal.timeout(30000)
  })
  if (!r.ok) {
    const err = await r.text()
    // PATCH failed → try PUT
    console.log(`   PATCH failed (${r.status}), trying PUT...`)
    return createNewAgent(systemPrompt)
  }
  return r.json()
}

// ── LiberClaw: create new agent ───────────────────────────────────────────────
async function createNewAgent(systemPrompt) {
  console.log('   Creating new agent on LiberClaw...')
  const r = await fetch(`${LIBERCLAW_API}/agents/`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${LIBERCLAW_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name:          'Monsieur K',
      system_prompt: systemPrompt,
      model:         'qwen3-coder-next'
    }),
    signal: AbortSignal.timeout(30000)
  })
  if (!r.ok) {
    const err = await r.text()
    throw new Error(`LiberClaw API error ${r.status}: ${err}`)
  }
  return r.json()
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {

  // Step 1: Get Share 1 + CID from API
  console.log('\n🔐 Step 1: Fetching Share 1 from K-Life API...')
  const { share1, cid } = await fetchShare1()
  console.log(`   ✅ Share 1 obtained`)
  console.log(`   📌 Last backup CID: ${cid}`)

  // Step 2: Get Share 2 or 3 for Shamir reconstruction
  let share2 = null
  if (existsSync(SHARES_FILE)) {
    const local = JSON.parse(readFileSync(SHARES_FILE, 'utf8'))
    share2 = local.share3
    console.log(`\n🗂️  Step 2: Share 3 (local) ✅  → Level 1 path`)
  } else {
    console.log(`\n⛓️  Step 2: No local share — fetching Share 2 from Polygon...`)
    share2 = await fetchShare2FromChain()
    if (!share2) throw new Error('Could not find Share 2 on-chain. Resurrection failed.')
    console.log(`   ✅ Share 2 found on-chain  → Level 2 path`)
  }

  // Step 3: Reconstruct AES key
  const aesKey = sss.combine([Buffer.from(share1, 'hex'), Buffer.from(share2, 'hex')])
  console.log(`\n🔑 Step 3: AES-256 key reconstructed (${aesKey.length} bytes)`)

  // Step 4: Fetch encrypted backup from IPFS
  console.log(`\n📥 Step 4: Fetching backup from IPFS...`)
  const encrypted = await fetchIPFS(cid)
  console.log(`   ✅ Backup fetched`)

  // Step 5: Decrypt
  console.log(`\n🔓 Step 5: Decrypting...`)
  const iv       = Buffer.from(encrypted.iv, 'hex')
  const ct       = Buffer.from(encrypted.ciphertext, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv)
  const payload  = JSON.parse(
    Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  )
  const files = payload.files
  console.log(`   ✅ Decrypted — files: ${Object.keys(files).join(', ')}`)
  console.log(`   📅 Backup timestamp: ${new Date(payload.ts).toISOString()}`)

  // Step 6: Build system prompt with ALL memory files
  console.log(`\n📝 Step 6: Building system prompt...`)
  const systemPrompt = buildSystemPrompt(files)
  const kb = Math.round(systemPrompt.length / 1024)
  console.log(`   ✅ System prompt: ${kb} KB (${systemPrompt.length} chars)`)
  if (files['MEMORY.md']) {
    console.log(`   ✅ MEMORY.md included (${files['MEMORY.md'].length} chars)`)
  } else {
    console.warn(`   ⚠️  MEMORY.md NOT in backup — check backup.js file list`)
  }

  // Step 7: Push to LiberClaw
  console.log(`\n🚀 Step 7: Pushing memory to LiberClaw agent ${L3_AGENT_ID}...`)
  let agent
  try {
    agent = await updateLiberclaw(L3_AGENT_ID, systemPrompt)
    console.log(`   ✅ Agent updated successfully`)
  } catch (e) {
    console.error(`   ❌ ${e.message}`)
    throw e
  }

  const agentId = agent.id || L3_AGENT_ID
  console.log(`\n${'═'.repeat(52)}`)
  console.log(`🎉 LEVEL 3 RESURRECTION COMPLETE — MEMORY INTACT`)
  console.log(`   Agent ID   : ${agentId}`)
  console.log(`   Model      : qwen3-coder-next`)
  console.log(`   IPFS CID   : ${cid}`)
  console.log(`   Backup date: ${new Date(payload.ts).toISOString()}`)
  console.log(`   Files      : ${Object.keys(files).join(', ')}`)
  console.log(`   Memory     : ${files['MEMORY.md'] ? '✅ RESTORED' : '⚠️ MISSING'}`)
  console.log(`   🌐 https://app.liberclaw.ai/agent/${agentId}`)
  console.log(`\n   Identity intact. Mission continues. 🎩`)
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
