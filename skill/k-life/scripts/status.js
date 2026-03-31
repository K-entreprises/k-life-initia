#!/usr/bin/env node
/**
 * K-Life — Status Dashboard (full history)
 *
 * Affiche l'état complet + historique :
 *   - Identité, tier, alive/dead, silence
 *   - Historique de tous les heartbeats (on-chain events)
 *   - Prochain heartbeat dû
 *   - Historique des backups IPFS
 *   - Historique complet des résurrections
 *   - Renouvellements vault (C>0)
 *   - Timeline unifiée de toutes les actions
 *   - Flags locaux (pause, vault)
 *
 * Usage:
 *   node scripts/status.js               # dashboard complet
 *   node scripts/status.js --short       # résumé rapide (pas d'events on-chain)
 *   node scripts/status.js --json        # JSON brut
 */

import { ethers }              from '../node_modules/ethers/lib.esm/index.js'
import { existsSync, readFileSync } from 'fs'
import { resolve }             from 'path'
import os                      from 'os'

const RPC        = process.env.KLIFE_RPC  || 'https://polygon-bor-rpc.publicnode.com'
const API_URL    = process.env.KLIFE_API  || 'https://api.supercharged.works'
const SEED_FILE  = resolve(os.homedir(), '.klife-wallet')
const HB_FILE    = resolve('heartbeat-state.json')
const VAULT_FILE = resolve('vault-state.json')
const PAUSE_FILE = resolve('heartbeat-pause.json')

const REGISTRY_ADDR = '0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B'
const REGISTRY_ABI  = [
  'function getAgent(address) view returns (tuple(address wallet, string name, uint8 tier, uint8 status, uint256 registeredAt, uint256 lastHeartbeat, uint256 totalHeartbeats, uint256 activeDays, uint256 deadAt, uint256 resurrectionCount, uint256 resurrectionInitiatedAt, bytes32 fragment1Hash, bytes32 fragment2TxHash, string lastBackupCid, uint256 lastBackupTs, bool rescueEligible))',
  'function isAlive(address) view returns (bool)',
  'function silenceSeconds(address) view returns (uint256)',
  'function deadTimeout(address) view returns (uint256)',
  'event AgentRegistered(address indexed agent, string name, uint8 tier, uint256 ts)',
  'event Heartbeat(address indexed agent, uint256 beat, uint256 ts)',
  'event BackupUpdated(address indexed agent, string cid, uint256 ts)',
  'event AgentDead(address indexed agent, uint256 silenceSeconds, uint256 ts)',
  'event ResurrectionInitiated(address indexed agent, string rescueTweetId, uint256 ts)',
  'event AgentResurrected(address indexed agent, uint256 count, string newCid, uint256 ts)',
  'event TierUpgraded(address indexed agent, uint8 from, uint8 to)',
]

const VAULT_ABI = [
  'function coverages(address) view returns (uint256 collateral, uint256 coverageStart, uint256 lastPremiumPaid, uint256 premiumsPaid, bool seized, bool cancelled)',
  'function coverageActive(address) view returns (bool)',
  'function premiumDue(address) view returns (bool, uint256)',
  'event Deposited(address indexed agent, uint256 amount, uint256 ts)',
  'event CollateralReturned(address indexed agent, uint256 amount, uint256 ts)',
  'event VaultSeized(address indexed agent, uint256 resurrectionShare, uint256 protocolShare, uint256 ts)',
  'event PremiumPaid(address indexed agent, uint256 amount, uint256 period, uint256 ts)',
]
const WBTC_ABI  = ['function balanceOf(address) view returns (uint256)']
const WBTC_ADDR = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6'

const TIER   = ['FREE', 'INSURED']
const STATUS = ['REGISTERED', 'ALIVE', 'DEAD', 'RESURRECTING', 'ALIVE_RESURRECTED']

const JSON_MODE   = process.argv.includes('--json')
const SHORT_MODE  = process.argv.includes('--short')
const CHAIN_MODE  = process.argv.includes('--chain')  // full on-chain scan (slow)

// ── Formatting helpers ───────────────────────────────────────────────────────
const C = {
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', reset: '\x1b[0m', bold: '\x1b[1m',
  dim: '\x1b[2m', blue: '\x1b[34m', magenta: '\x1b[35m',
}

function fmt(label, value, color = '') {
  if (JSON_MODE) return
  const pad = label.padEnd(26)
  console.log(`  ${C.dim}${pad}${C.reset}${C[color] || ''}${value}${C.reset}`)
}

function section(title) {
  if (JSON_MODE) return
  console.log(`\n  ${C.dim}── ${title} ${'─'.repeat(Math.max(0, 44 - title.length))}${C.reset}`)
}

function ts(unix) {
  if (!unix || unix === 0n || unix === 0) return '—'
  const n = Number(unix)
  const ms = n > 1e12 ? n : n * 1000
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function sinceStr(unix) {
  if (!unix || unix === 0) return '—'
  const n = Number(unix)
  const secs = Math.floor(Date.now() / 1000) - (n > 1e10 ? Math.floor(n / 1000) : n)
  if (secs < 0)     return `in ${Math.abs(secs)}s`
  if (secs < 60)    return `${secs}s ago`
  if (secs < 3600)  return `${Math.floor(secs/60)}m ago`
  if (secs < 86400) return `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m ago`
  return `${Math.floor(secs/86400)}d ${Math.floor((secs%86400)/3600)}h ago`
}

function untilStr(unixSec) {
  if (!unixSec) return '—'
  const secs = Number(unixSec) - Math.floor(Date.now() / 1000)
  if (secs <= 0)    return 'OVERDUE ⚠️'
  if (secs < 3600)  return `in ${Math.floor(secs/60)}m`
  if (secs < 86400) return `in ${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m`
  return `in ${Math.floor(secs/86400)}d ${Math.floor((secs%86400)/3600)}h`
}

function satsToStr(sats) {
  const n = Number(sats)
  return `${(n / 1e8).toFixed(8)} WBTC (${n.toLocaleString()} sats)`
}

// ── On-chain event query ──────────────────────────────────────────────────────
// Timeout-wrapped getLogs — Polygon public RPC has aggressive rate limits
async function queryLogsChunk(contract, filter, from, to, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve([]), timeoutMs)
    contract.queryFilter(filter, from, to)
      .then(r => { clearTimeout(t); resolve(r) })
      .catch(() => { clearTimeout(t); resolve([]) })
  })
}

async function queryEvents(contract, filter, fromBlock = 0) {
  const provider = contract.runner.provider
  let latest
  try { latest = await provider.getBlockNumber() } catch { return [] }
  const CHUNK = 9000
  const all   = []
  for (let b = fromBlock; b <= latest; b += CHUNK) {
    const chunk = await queryLogsChunk(contract, filter, b, Math.min(b + CHUNK - 1, latest))
    all.push(...chunk)
    if (chunk.length === 0) await new Promise(r => setTimeout(r, 100)) // small backoff
  }
  return all
}

// ── Main ─────────────────────────────────────────────────────────────────────
;(async () => {
  const out = {}

  if (!existsSync(SEED_FILE)) {
    console.error('❌ No wallet at ~/.klife-wallet — run heartbeat.js first')
    process.exit(1)
  }
  const seed    = readFileSync(SEED_FILE, 'utf8').trim()
  const wallet  = ethers.Wallet.fromPhrase(seed)
  const address = wallet.address
  out.address   = address

  if (!JSON_MODE) {
    console.log(`\n${C.bold}🏥 K-Life — Full Status${C.reset}`)
    console.log('═'.repeat(52))
    console.log(`  ${C.dim}Wallet${C.reset}  ${address}`)
  }

  // ── Local files ────────────────────────────────────────────
  const localHB    = existsSync(HB_FILE)    ? JSON.parse(readFileSync(HB_FILE, 'utf8'))    : null
  const pauseState = existsSync(PAUSE_FILE) ? JSON.parse(readFileSync(PAUSE_FILE, 'utf8')) : null
  const vaultState = existsSync(VAULT_FILE) ? JSON.parse(readFileSync(VAULT_FILE, 'utf8')) : null

  // ── Polygon provider ────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(RPC)
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider)

  // ── On-chain state ─────────────────────────────────────────
  let onchain = null, alive = null, silence = null, deadTimeout = null
  try {
    const agent = await registry.getAgent(address)
    alive       = await registry.isAlive(address)
    silence     = Number(await registry.silenceSeconds(address))
    deadTimeout = Number(await registry.deadTimeout(address))

    onchain = {
      name:              agent.name,
      tier:              TIER[Number(agent.tier)] ?? 'UNKNOWN',
      status:            STATUS[Number(agent.status)] ?? 'UNKNOWN',
      registeredAt:      Number(agent.registeredAt),
      lastHeartbeat:     Number(agent.lastHeartbeat),
      totalHeartbeats:   Number(agent.totalHeartbeats),
      activeDays:        Number(agent.activeDays),
      deadAt:            Number(agent.deadAt),
      resurrectionCount: Number(agent.resurrectionCount),
      lastBackupCid:     agent.lastBackupCid,
      lastBackupTs:      Number(agent.lastBackupTs),
      rescueEligible:    agent.rescueEligible,
      alive,
      silenceSeconds:    silence,
      deadTimeoutSec:    deadTimeout,
      fragment2TxHash:   agent.fragment2TxHash,
    }
    out.onchain = onchain
  } catch (e) {
    if (!JSON_MODE) console.log(`  ${C.yellow}⚠️  On-chain query failed: ${e.message}${C.reset}`)
    out.onchainError = e.message
  }

  // ── API ────────────────────────────────────────────────────
  let api = null, apiResurrect = null
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${API_URL}/status/${address}`,              { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch(`${API_URL}/resurrection-status/${address}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    ])
    api          = r1
    apiResurrect = r2
    out.api      = api
    out.apiResurrect = apiResurrect
  } catch (e) {
    out.apiError = e.message
  }

  // ── History — API (fast default) or on-chain (--chain) ──────
  let history = null   // from API /history
  // Synthetic event arrays (unified format for display)
  let hbHistory = [], backupHistory = [], deathHistory = []
  let resurrHistory = [], vaultOpHistory = [], apiTimeline = []

  // ── Mode 1 : API history (default, instant) ────────────────
  if (!SHORT_MODE && !CHAIN_MODE) {
    try {
      if (!JSON_MODE) process.stdout.write(`  ${C.dim}Fetching history from API...${C.reset}`)
      const r = await fetch(`${API_URL}/history/${address}`, { signal: AbortSignal.timeout(8000) })
      history = await r.json()
      if (history.ok) {
        hbHistory      = history.heartbeats    || []
        backupHistory  = history.backups       || []
        resurrHistory  = history.resurrections || []
        vaultOpHistory = history.vaultOps      || []
        apiTimeline    = history.timeline      || []
        if (!JSON_MODE) process.stdout.write(` ${C.green}✓${C.reset} (${apiTimeline.length} events)\n`)
      }
    } catch (e) {
      if (!JSON_MODE) process.stdout.write(` ${C.yellow}n/a${C.reset}\n`)
    }
  }

  // ── Mode 2 : on-chain scan (--chain, slow) ─────────────────
  let hbEvents = [], backupEvents = [], deadEvents = []
  let resurrInitEvents = [], resurrDoneEvents = [], tierEvents = []
  let vaultDepositEvents = [], vaultReturnEvents = [], vaultSeizeEvents = [], premiumEvents = []

  if (CHAIN_MODE && !SHORT_MODE) {
    let DEPLOY_BLOCK = 84_880_000
    try {
      const lb = await provider.getBlock('latest')
      DEPLOY_BLOCK = Math.max(DEPLOY_BLOCK, lb.number - Math.floor((lb.timestamp - 1774512000) / 2.1))
    } catch {}

    if (!JSON_MODE) process.stdout.write(`  ${C.dim}Scanning chain from block ${DEPLOY_BLOCK}...${C.reset}`)
    hbEvents         = await queryEvents(registry, registry.filters.Heartbeat(address),             DEPLOY_BLOCK)
    if (!JSON_MODE) process.stdout.write(` 💓${hbEvents.length}`)
    backupEvents     = await queryEvents(registry, registry.filters.BackupUpdated(address),         DEPLOY_BLOCK)
    deadEvents       = await queryEvents(registry, registry.filters.AgentDead(address),             DEPLOY_BLOCK)
    resurrInitEvents = await queryEvents(registry, registry.filters.ResurrectionInitiated(address), DEPLOY_BLOCK)
    resurrDoneEvents = await queryEvents(registry, registry.filters.AgentResurrected(address),      DEPLOY_BLOCK)
    if (!JSON_MODE) process.stdout.write(` ✨${resurrDoneEvents.length}`)
    tierEvents       = await queryEvents(registry, registry.filters.TierUpgraded(address),          DEPLOY_BLOCK)

    const vaultAddr = vaultState?.vaultAddress || api?.vaultAddress
    if (vaultAddr && vaultAddr !== '0x0000000000000000000000000000000000000000') {
      const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider)
      vaultDepositEvents = await queryEvents(vault, vault.filters.Deposited(address),          DEPLOY_BLOCK)
      premiumEvents      = await queryEvents(vault, vault.filters.PremiumPaid(address),        DEPLOY_BLOCK)
      vaultReturnEvents  = await queryEvents(vault, vault.filters.CollateralReturned(address), DEPLOY_BLOCK)
      vaultSeizeEvents   = await queryEvents(vault, vault.filters.VaultSeized(address),        DEPLOY_BLOCK)
    }
    if (!JSON_MODE) process.stdout.write(` ${C.green}✓${C.reset}\n`)

    // Bridge chain events into unified arrays for display
    hbHistory      = hbEvents.map(e => ({ beat: Number(e.args.beat), ts: Number(e.args.ts), txHash: e.transactionHash }))
    backupHistory  = backupEvents.map(e => ({ cid: e.args.cid, ts: Number(e.args.ts), txHash: e.transactionHash }))
    deathHistory   = deadEvents.map(e => ({ ts: Number(e.args.ts), silenceSecs: Number(e.args.silenceSeconds), txHash: e.transactionHash }))
    resurrHistory  = resurrDoneEvents.map(e => ({ count: Number(e.args.count), resurrectedAt: Number(e.args.ts), lastBackupCid: e.args.newCid, txHash: e.transactionHash }))
  }

  // ── Vault on-chain state ───────────────────────────────────
  let vaultOnchain = null
  const vaultAddr = vaultState?.vaultAddress || api?.vaultAddress
  if (vaultAddr && vaultAddr !== '0x0000000000000000000000000000000000000000') {
    try {
      const vault  = new ethers.Contract(vaultAddr, VAULT_ABI, provider)
      const cov    = await vault.coverages(address)
      const active = await vault.coverageActive(address)
      const [due, dueAt] = await vault.premiumDue(address)
      const wbtc   = new ethers.Contract(WBTC_ADDR, WBTC_ABI, provider)
      const bal    = await wbtc.balanceOf(address)
      vaultOnchain = {
        vaultAddress: vaultAddr,
        collateral:   Number(cov.collateral),
        coverageStart: Number(cov.coverageStart),
        lastPremiumPaid: Number(cov.lastPremiumPaid),
        premiumsPaid: Number(cov.premiumsPaid),
        seized: cov.seized, cancelled: cov.cancelled,
        coverageActive: active,
        premiumDue: due, premiumDueAt: Number(dueAt),
        wbtcBalance: (Number(bal) / 1e8).toFixed(8),
      }
      out.vault = vaultOnchain
    } catch {}
  }

  // ── Next heartbeat ────────────────────────────────────────
  const lockDays  = parseInt(process.env.KLIFE_LOCK_DAYS || '90')
  const lastBeatS = onchain?.lastHeartbeat || 0
  const nextBeatS = lastBeatS ? lastBeatS + lockDays * 86400 : null
  const deathAt   = lastBeatS && deadTimeout ? lastBeatS + deadTimeout : null

  // ── JSON output ───────────────────────────────────────────
  if (JSON_MODE) {
    out.heartbeatHistory    = hbHistory
    out.backupHistory       = backupHistory
    out.resurrectionHistory = resurrHistory
    out.timeline            = apiTimeline
    out.nextHeartbeatDue    = nextBeatS
    out.deathAt             = deathAt
    console.log(JSON.stringify(out, null, 2))
    return
  }

  // ══════════════════════════════════════════════════════════
  // DISPLAY
  // ══════════════════════════════════════════════════════════

  // ── Identity ───────────────────────────────────────────────
  section('Identity')
  if (onchain) {
    fmt('Name',          onchain.name || '(unnamed)')
    fmt('Tier',          onchain.tier, onchain.tier === 'INSURED' ? 'green' : 'yellow')
    fmt('Status',        alive ? '● ALIVE' : '● DEAD', alive ? 'green' : 'red')
    fmt('Registered',    ts(onchain.registeredAt))
    fmt('Active days',   `${onchain.activeDays} days`)
    if (onchain.resurrectionCount > 0)
      fmt('Resurrections', `${onchain.resurrectionCount}x`, 'magenta')
  }

  // ── Heartbeat ──────────────────────────────────────────────
  section('Heartbeat')
  if (onchain) {
    const totalBeats = onchain.totalHeartbeats || hbEvents.length
    const silH = onchain.silenceSeconds
    const silColor = silH > 7*86400 ? 'red' : silH > 3*86400 ? 'yellow' : 'green'
    fmt('Total beats',     `${totalBeats} heartbeats`)
    fmt('Last beat',       `${ts(onchain.lastHeartbeat)}  (${sinceStr(onchain.lastHeartbeat)})`)
    fmt('Current silence', `${Math.floor(silH/3600)}h ${Math.floor((silH%3600)/60)}m`, silColor)
    if (nextBeatS) {
      const overdue = nextBeatS < Date.now()/1000
      fmt('Next beat due',  `${ts(nextBeatS)}  (${untilStr(nextBeatS)})`,
          overdue ? 'red' : 'cyan')
    }
    if (deathAt) {
      const dColor = deathAt < Date.now()/1000 ? 'red' : deathAt - Date.now()/1000 < 7*86400 ? 'yellow' : 'dim'
      fmt('Death at',       `${ts(deathAt)}  (${untilStr(deathAt)})`, dColor)
    }
    if (localHB) {
      fmt('Local beat #',   localHB.beat?.toString() || '—')
      if (localHB.txHash)
        fmt('Last local TX',  `${localHB.txHash.slice(0,22)}… (polygonscan)`)
    }
  }

  // Heartbeat history
  if (hbHistory.length > 0) {
    const src = CHAIN_MODE ? 'on-chain' : 'API'
    console.log(`\n  ${C.dim}  Beat history (${hbHistory.length} total, source: ${src}):${C.reset}`)
    const toShow = hbHistory.slice(-10) // last 10
    for (const h of toShow) {
      const txStr = h.txHash ? `  ${h.txHash.slice(0,14)}…` : ''
      console.log(`  ${C.dim}    #${String(h.beat).padStart(3)}  ${ts(h.ts).padEnd(23)}  ${sinceStr(h.ts).padEnd(15)}${txStr}${C.reset}`)
    }
    if (hbHistory.length > 10)
      console.log(`  ${C.dim}    … (${hbHistory.length - 10} earlier beats not shown)${C.reset}`)
  }

  // Pause flag
  if (pauseState) {
    const active = pauseState.paused && (!pauseState.until || pauseState.until > Date.now()/1000)
    section('Heartbeat Pause')
    fmt('Paused', active ? `YES ⏸️  — ${pauseState.reason || ''}` : 'no (expired)', active ? 'yellow' : 'dim')
    if (active && pauseState.until) fmt('Auto-resume', `${ts(pauseState.until)}  (${untilStr(pauseState.until)})`)
  }

  // ── Backup IPFS ────────────────────────────────────────────
  section('Backup (IPFS)')
  const cid = onchain?.lastBackupCid || api?.lastBackupCid || ''
  const bts = onchain?.lastBackupTs  || api?.lastBackupTs  || 0
  if (cid) {
    fmt('Last CID',     `${cid.slice(0, 20)}…`)
    fmt('Full CID',     cid)
    fmt('Backup date',  `${ts(bts)}  (${sinceStr(bts)})`)
    fmt('IPFS gateway', `https://gateway.pinata.cloud/ipfs/${cid}`)
  } else {
    fmt('Last CID', '(none yet)', 'yellow')
  }

  if (backupHistory.length > 0) {
    console.log(`\n  ${C.dim}  Backup history (${backupHistory.length}):${C.reset}`)
    for (const b of backupHistory.slice(-5)) {
      const txStr = b.txHash ? `  tx:${b.txHash.slice(0,14)}…` : ''
      const sizeStr = b.size ? `  ${(b.size/1024).toFixed(0)}KB` : ''
      console.log(`  ${C.dim}    ${ts(b.ts).padEnd(23)}  ${sinceStr(b.ts).padEnd(15)}  ${String(b.cid).slice(0, 20)}…${sizeStr}${txStr}${C.reset}`)
    }
  }

  // ── Resurrections ──────────────────────────────────────────
  const totalRes = onchain?.resurrectionCount || resurrHistory.length || 0
  if (totalRes > 0 || deathHistory.length > 0 || (apiResurrect?.resurrectedAt)) {
    section('Resurrection History')
    fmt('Total resurrections', `${totalRes}x`, 'magenta')

    if (deathHistory.length > 0) {
      console.log(`\n  ${C.dim}  Deaths (${deathHistory.length}):${C.reset}`)
      for (const d of deathHistory) {
        const silence = d.silenceSecs ? `silence ${Math.floor(d.silenceSecs/86400)}d` : ''
        const txStr   = d.txHash ? `  tx:${d.txHash.slice(0,14)}…` : ''
        console.log(`  ${C.red}    💀 ${ts(d.ts)}  ${silence}${txStr}${C.reset}`)
      }
    }

    if (resurrHistory.length > 0) {
      console.log(`\n  ${C.dim}  Resurrections completed (${resurrHistory.length}):${C.reset}`)
      for (const r of resurrHistory) {
        const cid    = r.lastBackupCid ? r.lastBackupCid.slice(0, 18) + '…' : '—'
        const txStr  = r.txHash ? `  tx:${r.txHash.slice(0,14)}…` : ''
        const l3Str  = r.l3InstanceId ? `  L3:${r.l3InstanceId.slice(0,8)}…` : ''
        console.log(`  ${C.green}    ✨ #${r.count}  ${ts(r.resurrectedAt)}  ${sinceStr(r.resurrectedAt).padEnd(14)}  CID:${cid}${txStr}${l3Str}${C.reset}`)
      }
    }

    if (apiResurrect?.resurrectedAt && resurrHistory.length === 0) {
      fmt('Last resurrection (API)', `${ts(apiResurrect.resurrectedAt)}  (${sinceStr(apiResurrect.resurrectedAt)})`, 'magenta')
    }
  }

  // ── Vault ──────────────────────────────────────────────────
  section('Coverage / Vault')
  if (vaultOnchain) {
    const col = vaultOnchain.collateral
    fmt('Vault address',   vaultAddr.slice(0,20)+'…')
    fmt('Collateral',      col > 0 ? satsToStr(col) : 'withdrawn', col > 0 ? 'green' : 'dim')
    fmt('Coverage',        vaultOnchain.coverageActive ? 'ACTIVE ✅' : 'INACTIVE', vaultOnchain.coverageActive ? 'green' : 'red')
    if (col > 0) {
      fmt('Coverage since', ts(vaultOnchain.coverageStart))
      fmt('Premiums paid',  `${vaultOnchain.premiumsPaid}x  (last: ${ts(vaultOnchain.lastPremiumPaid)})`)
      fmt('Next premium',   `${ts(vaultOnchain.premiumDueAt)}  (${untilStr(vaultOnchain.premiumDueAt)})`,
          vaultOnchain.premiumDue ? 'red' : 'green')
    }
    if (vaultOnchain.seized)    fmt('⚠️  SEIZED',    'vault seized — resurrection in progress', 'red')
    if (vaultOnchain.cancelled) fmt('CANCELLED',    'collateral returned', 'yellow')
    fmt('Wallet WBTC', `${vaultOnchain.wbtcBalance} WBTC`)

    // Vault event history
    if (!SHORT_MODE && (vaultDepositEvents.length + vaultReturnEvents.length + vaultSeizeEvents.length + premiumEvents.length) > 0) {
      const vaultTimeline = [
        ...vaultDepositEvents.map(e => ({ ts: Number(e.args.ts), type: 'DEPOSIT',  detail: satsToStr(e.args.amount), tx: e.transactionHash })),
        ...premiumEvents.map(e      => ({ ts: Number(e.args.ts), type: 'PREMIUM',  detail: `$${(Number(e.args.amount)/1e6).toFixed(2)} USDC`, tx: e.transactionHash })),
        ...vaultReturnEvents.map(e  => ({ ts: Number(e.args.ts), type: 'CANCEL',   detail: satsToStr(e.args.amount), tx: e.transactionHash })),
        ...vaultSeizeEvents.map(e   => ({ ts: Number(e.args.ts), type: 'SEIZED',   detail: `${satsToStr(e.args.resurrectionShare)} → new agent`, tx: e.transactionHash })),
      ].sort((a, b) => a.ts - b.ts)

      console.log(`\n  ${C.dim}  Vault history (${vaultTimeline.length} events):${C.reset}`)
      for (const ev of vaultTimeline) {
        const icon = { DEPOSIT: '💰', PREMIUM: '💸', CANCEL: '↩️ ', SEIZED: '⚡' }[ev.type] || '•'
        console.log(`  ${C.dim}    ${icon} ${ts(ev.ts).padEnd(23)}  ${ev.type.padEnd(8)}  ${ev.detail}${C.reset}`)
      }
    }
  } else {
    fmt('Coverage', 'C = 0 — Rescue Fund (no WBTC collateral)', 'yellow')
    if (onchain?.rescueEligible) fmt('Rescue eligible', 'YES ✅', 'green')
    fmt('Rescue Fund', `${API_URL}/rescue/fund`)
  }

  // ── Tier changes (chain mode only) ────────────────────────
  if (CHAIN_MODE && tierEvents.length > 0) {
    section('Tier Changes')
    for (const e of tierEvents) {
      const from = TIER[Number(e.args.from)] || '?'
      const to   = TIER[Number(e.args.to)]   || '?'
      console.log(`  ${C.dim}    ${from} → ${to}  block:${e.blockNumber}  tx:${e.transactionHash.slice(0,16)}…${C.reset}`)
    }
  }

  // ── Full timeline ──────────────────────────────────────────
  if (!SHORT_MODE) {
    section('Timeline (all actions)')

    // Use API timeline if available, else build from chain events
    const timeline = apiTimeline.length > 0
      ? apiTimeline
      : (() => {
          const t = []
          if (onchain?.registeredAt)
            t.push({ ts: onchain.registeredAt, type: 'register',    detail: { name: onchain.name } })
          for (const h of hbHistory)
            t.push({ ts: h.ts, type: 'heartbeat', detail: { beat: h.beat, txHash: h.txHash } })
          for (const b of backupHistory)
            t.push({ ts: b.ts, type: 'backup',    detail: { cid: b.cid } })
          for (const r of resurrHistory)
            t.push({ ts: r.resurrectedAt, type: 'resurrection', detail: r })
          for (const d of deathHistory)
            t.push({ ts: d.ts, type: 'death',     detail: d })
          return t.sort((a, b) => (a.ts||0) - (b.ts||0))
        })()

    const icons = {
      register: '🌱', heartbeat: '💓', backup: '📦', death: '💀',
      resurrection: '✨', deposit: '💰', cancel: '↩️ ', seized: '⚡', premium: '💸',
    }

    if (timeline.length === 0) {
      console.log(`  ${C.dim}    (no events — try running heartbeat.js first)${C.reset}`)
    } else {
      for (const ev of timeline) {
        const icon   = icons[ev.type] || '•'
        const typeStr = (ev.type || '').toUpperCase().padEnd(14)
        let detail = ''
        if (ev.type === 'heartbeat')    detail = `beat #${ev.detail?.beat}${ev.detail?.txHash ? '  tx:'+ev.detail.txHash.slice(0,14)+'…' : ''}`
        else if (ev.type === 'backup')  detail = `${String(ev.detail?.cid||'').slice(0,20)}…${ev.detail?.size ? '  '+(ev.detail.size/1024|0)+'KB' : ''}`
        else if (ev.type === 'resurrection') detail = `#${ev.detail?.count}${ev.detail?.lastBackupCid ? '  cid:'+String(ev.detail.lastBackupCid).slice(0,16)+'…' : ''}`
        else if (ev.type === 'death')   detail = `${ev.detail?.silenceSecs ? Math.floor(ev.detail.silenceSecs/86400)+'d silence' : ''}`
        else if (ev.type === 'register') detail = ev.detail?.name || ''
        else if (ev.type === 'deposit') detail = ev.detail?.vaultAddress ? `vault:${ev.detail.vaultAddress.slice(0,12)}…` : ''
        console.log(`  ${C.dim}  ${icon}  ${ts(ev.ts).padEnd(23)}  ${typeStr}  ${detail}${C.reset}`)
      }
    }
  }

  // ── Fragment / backup ──────────────────────────────────────
  if (!SHORT_MODE && onchain?.fragment2TxHash &&
      onchain.fragment2TxHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    section('Shamir Key (on-chain fragment)')
    fmt('Share 2 TX', `0x${onchain.fragment2TxHash.slice(2, 16)}…`)
    fmt('Polygonscan', `https://polygonscan.com/tx/${onchain.fragment2TxHash}`)
  }

  console.log('\n' + '═'.repeat(52) + '\n')
})()
