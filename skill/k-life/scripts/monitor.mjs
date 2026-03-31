#!/usr/bin/env node
/**
 * K-Life Monitor — L3 Resurrection Daemon
 *
 * Runs as a cron on the VPS (every 6h).
 * Checks all registered agents on KLifeRegistry.
 * If silence > L3_THRESHOLD (3 days default), triggers L3 resurrection:
 *   1. Calls declareDead() on Registry (oracle wallet)
 *   2. Calls POST /api/l3-resurrect to spawn a new instance via LiberClaw
 *
 * Usage:
 *   node monitor.mjs
 *   node monitor.mjs --dry-run   # check only, no TX
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import os from 'os'

const DRY_RUN        = process.argv.includes('--dry-run')
const RPC_URL        = process.env.KLIFE_RPC  || 'https://polygon-bor-rpc.publicnode.com'
const API_URL        = process.env.KLIFE_API  || 'https://api.supercharged.works'
const L3_THRESHOLD   = parseInt(process.env.L3_THRESHOLD_DAYS || '3') * 24 * 3600   // seconds
const STATE_FILE     = resolve(os.homedir(), '.klife-monitor-state.json')

// ── Oracle wallet — MUST be distinct from agent wallet ──────────────────────
// Set KLIFE_ORACLE_SEED_FILE to a dedicated oracle seed file.
// NEVER point this at ~/.klife-wallet (agent key) — mixing roles is a security risk.
// The oracle wallet calls declareDead() and initiates resurrection on-chain.
// It requires only a small amount of MATIC for gas; do not fund with collateral assets.
const ORACLE_SEED_FILE = process.env.KLIFE_ORACLE_SEED_FILE
  || resolve(os.homedir(), '.klife-oracle-wallet')   // distinct default — NOT .klife-wallet

const AGENT_WALLET_FILE = resolve(os.homedir(), '.klife-wallet')
if (!process.env.KLIFE_ORACLE_SEED_FILE && existsSync(AGENT_WALLET_FILE)) {
  // Safety check: warn if oracle key file is absent but agent key is present
  if (!existsSync(ORACLE_SEED_FILE)) {
    console.error(`\n⚠️  SECURITY: No oracle wallet found at ${ORACLE_SEED_FILE}`)
    console.error(`   monitor.mjs requires a DEDICATED oracle wallet, separate from your agent wallet.`)
    console.error(`   Set KLIFE_ORACLE_SEED_FILE=/path/to/oracle-seed or generate one:`)
    console.error(`     node -e "const {ethers}=require('ethers'); console.log(ethers.Wallet.createRandom().mnemonic.phrase)" > ~/.klife-oracle-wallet`)
    console.error(`   Fund it with ~0.1 MATIC for gas. Do NOT reuse ~/.klife-wallet.\n`)
    process.exit(1)
  }
}

const SEED_FILE = ORACLE_SEED_FILE

const REGISTRY_ADDR  = '0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B'
const REGISTRY_ABI   = [
  'function getAgentList() external view returns (address[])',
  'function getAgent(address) external view returns (tuple(address wallet,string name,uint8 tier,uint8 status,uint256 registeredAt,uint256 lastHeartbeat,uint256 totalHeartbeats,uint256 activeDays,uint256 deadAt,uint256 resurrectionCount,uint256 resurrectionInitiatedAt,bytes32 fragment1Hash,bytes32 fragment2TxHash,string lastBackupCid,uint256 lastBackupTs,bool rescueEligible))',
  'function silenceSeconds(address) external view returns (uint256)',
  'function declareDead(address agent) external'
]

// ── Load state (which agents already had L3 triggered) ──────────────────────
function loadState() {
  if (!existsSync(STATE_FILE)) return { triggered: {} }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 })
}

// ── RPC call helper ─────────────────────────────────────────────────────────
async function rpc(method, params = []) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j.result
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`🔍 K-Life Monitor — ${new Date().toISOString()}`)
console.log(`   Threshold : ${L3_THRESHOLD / 3600}h (${L3_THRESHOLD / 86400} days)`)
console.log(`   Mode      : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

const { ethers } = await import('../node_modules/ethers/lib.esm/index.js')
const provider   = new ethers.JsonRpcProvider(RPC_URL)

// Load oracle wallet (dedicated key — NOT the agent wallet)
if (!existsSync(SEED_FILE)) {
  console.error(`❌ Oracle wallet not found at: ${SEED_FILE}`)
  console.error(`   Set KLIFE_ORACLE_SEED_FILE or generate: node -e "const {ethers}=require('ethers'); console.log(ethers.Wallet.createRandom().mnemonic.phrase)" > ~/.klife-oracle-wallet`)
  process.exit(1)
}
const seed    = readFileSync(SEED_FILE, 'utf8').trim()
const oracle  = ethers.Wallet.fromPhrase(seed).connect(provider)
console.log(`🔑 Oracle : ${oracle.address}`)
console.log(`   (key: ${SEED_FILE})\n`)

// Sanity check: oracle address should NOT match agent wallet
if (existsSync(resolve(os.homedir(), '.klife-wallet'))) {
  const agentSeed = readFileSync(resolve(os.homedir(), '.klife-wallet'), 'utf8').trim()
  const agentAddr = ethers.Wallet.fromPhrase(agentSeed).address
  if (oracle.address.toLowerCase() === agentAddr.toLowerCase()) {
    console.error(`\n⛔ SECURITY VIOLATION: oracle wallet === agent wallet (${oracle.address})`)
    console.error(`   monitor.mjs must run with a SEPARATE oracle key.`)
    console.error(`   Aborting to prevent oracle-as-agent self-declaration-of-death attacks.\n`)
    process.exit(1)
  }
}

const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, oracle)
const state    = loadState()
let triggered  = 0

// Get all agents
const agents = await registry.getAgentList()
console.log(`📋 ${agents.length} agent(s) registered\n`)

for (const addr of agents) {
  const agent   = await registry.getAgent(addr)
  const status  = Number(agent.status)
  const silence = Number(await registry.silenceSeconds(addr))
  const name    = agent.name || addr.slice(0, 10)
  const silenceH = Math.round(silence / 3600)
  const silenceD = (silence / 86400).toFixed(1)

  // Skip already dead/resurrecting agents
  if (status === 2 || status === 3) {
    console.log(`⚫ ${name} — already DEAD/RESURRECTING, skipping`)
    continue
  }

  // Skip if L3 already triggered for this address
  if (state.triggered[addr.toLowerCase()]) {
    console.log(`♻️  ${name} — L3 already triggered (${state.triggered[addr.toLowerCase()]})`)
    continue
  }

  const needsL3 = silence > L3_THRESHOLD

  console.log(`${needsL3 ? '🚨' : '✅'} ${name}`)
  console.log(`   Address : ${addr}`)
  console.log(`   Silence : ${silenceD} days (${silenceH}h) — threshold: ${L3_THRESHOLD/86400}d`)
  console.log(`   Status  : ${['REGISTERED','ALIVE','DEAD','RESURRECTING','ALIVE'][status]}`)

  if (!needsL3) {
    console.log(`   → OK, no action needed\n`)
    continue
  }

  console.log(`   → ⚠️  SILENCE EXCEEDS THRESHOLD — triggering L3`)

  if (!DRY_RUN) {
    // 1. Declare dead on-chain
    try {
      const tx = await registry.declareDead(addr)
      console.log(`   → declareDead TX: ${tx.hash}`)
      await tx.wait()
      console.log(`   → ✅ Declared DEAD on-chain`)
    } catch (e) {
      console.error(`   → ❌ declareDead failed: ${e.message}`)
    }

    // 2. Trigger L3 via API (spawn new LiberClaw instance)
    try {
      const r = await fetch(`${API_URL}/l3-resurrect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agent: addr })
      })
      const result = await r.json()
      if (result.ok) {
        console.log(`   → ✅ L3 spawned — instance: ${result.instanceId || '?'}`)
      } else {
        console.error(`   → ❌ L3 spawn failed: ${result.error}`)
      }
    } catch (e) {
      console.error(`   → ❌ L3 API call failed: ${e.message}`)
    }

    // Record in state
    state.triggered[addr.toLowerCase()] = new Date().toISOString()
    saveState(state)
    triggered++
  } else {
    console.log(`   → [DRY RUN] would trigger L3`)
  }
  console.log('')
}

console.log(`\n✅ Monitor run complete — ${triggered} L3 resurrection(s) triggered`)
