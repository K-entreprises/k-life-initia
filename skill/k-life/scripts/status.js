#!/usr/bin/env node
/**
 * K-Life — Status Dashboard
 *
 * Affiche l'état complet de l'agent K-Life :
 *   - Identité wallet + enregistrement on-chain
 *   - Dernier heartbeat, silence actuel, prochain beat dû
 *   - Backup IPFS (CID, date)
 *   - Couverture vault (collatéral WBTC, prime, statut)
 *   - Résurrection en cours ?
 *   - Flags locaux (pause heartbeat, vault-state)
 *
 * Usage:
 *   node scripts/status.js
 *   node scripts/status.js --json    # sortie JSON brute
 */

import { ethers }              from '../node_modules/ethers/lib.esm/index.js'
import { existsSync, readFileSync } from 'fs'
import { resolve }             from 'path'
import os                      from 'os'

const RPC       = process.env.KLIFE_RPC  || 'https://polygon-bor-rpc.publicnode.com'
const API_URL   = process.env.KLIFE_API  || 'https://api.supercharged.works'
const SEED_FILE = resolve(os.homedir(), '.klife-wallet')
const HB_FILE   = resolve('heartbeat-state.json')
const VAULT_FILE = resolve('vault-state.json')
const PAUSE_FILE = resolve('heartbeat-pause.json')

const REGISTRY_ADDR = '0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B'
const REGISTRY_ABI  = [
  'function getAgent(address) view returns (tuple(address wallet, string name, uint8 tier, uint8 status, uint256 registeredAt, uint256 lastHeartbeat, uint256 totalHeartbeats, uint256 activeDays, uint256 deadAt, uint256 resurrectionCount, uint256 resurrectionInitiatedAt, bytes32 fragment1Hash, bytes32 fragment2TxHash, string lastBackupCid, uint256 lastBackupTs, bool rescueEligible))',
  'function isAlive(address) view returns (bool)',
  'function silenceSeconds(address) view returns (uint256)',
]

const VAULT_ABI = [
  'function coverages(address) view returns (uint256 collateral, uint256 coverageStart, uint256 lastPremiumPaid, uint256 premiumsPaid, bool seized, bool cancelled)',
  'function coverageActive(address) view returns (bool)',
  'function premiumDue(address) view returns (bool, uint256)',
]

const WBTC_ADDR = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6'
const WBTC_ABI  = ['function balanceOf(address) view returns (uint256)']

const JSON_MODE = process.argv.includes('--json')

function fmt(label, value, color = '') {
  if (JSON_MODE) return
  const C = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m' }
  const pad = label.padEnd(24)
  console.log(`  ${C.dim}${pad}${C.reset}${C[color] || ''}${value}${C.reset}`)
}

function ts(unix) {
  if (!unix || unix === 0n) return 'never'
  const d = new Date(Number(unix) * 1000)
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function since(unix) {
  if (!unix || unix === 0n) return '—'
  const secs = Math.floor(Date.now() / 1000) - Number(unix)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`
  return `${Math.floor(secs/86400)}d ago`
}

function until(unix) {
  if (!unix || unix === 0n) return '—'
  const secs = Number(unix) - Math.floor(Date.now() / 1000)
  if (secs <= 0) return 'OVERDUE ⚠️'
  if (secs < 3600) return `in ${Math.floor(secs/60)}m`
  if (secs < 86400) return `in ${Math.floor(secs/3600)}h`
  return `in ${Math.floor(secs/86400)}d`
}

const TIER   = ['FREE', 'INSURED']
const STATUS = ['REGISTERED', 'ALIVE', 'DEAD', 'RESURRECTING', 'ALIVE_RESURRECTED']

;(async () => {
  const result = {}

  // ── Wallet ──────────────────────────────────────────────────
  if (!existsSync(SEED_FILE)) {
    console.error('❌ No wallet at ~/.klife-wallet — run heartbeat.js first')
    process.exit(1)
  }
  const seed    = readFileSync(SEED_FILE, 'utf8').trim()
  const wallet  = ethers.Wallet.fromPhrase(seed)
  const address = wallet.address
  result.address = address

  if (!JSON_MODE) {
    console.log('\n\x1b[1m🏥 K-Life Status\x1b[0m')
    console.log('═'.repeat(52))
    console.log(`  \x1b[2mWallet\x1b[0m                 ${address}`)
    console.log()
  }

  // ── Local state ──────────────────────────────────────────────
  let localBeat = null
  if (existsSync(HB_FILE)) {
    try { localBeat = JSON.parse(readFileSync(HB_FILE, 'utf8')) } catch {}
  }

  let pauseState = null
  if (existsSync(PAUSE_FILE)) {
    try { pauseState = JSON.parse(readFileSync(PAUSE_FILE, 'utf8')) } catch {}
  }

  let vaultState = null
  if (existsSync(VAULT_FILE)) {
    try { vaultState = JSON.parse(readFileSync(VAULT_FILE, 'utf8')) } catch {}
  }

  // ── On-chain via Polygon ─────────────────────────────────────
  let onchain = null
  let alive   = null
  let silence = null
  try {
    const provider = new ethers.JsonRpcProvider(RPC)
    const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider)
    const agent = await registry.getAgent(address)  // ethers v6 tuple — fields accessible by name
    alive   = await registry.isAlive(address)
    silence = await registry.silenceSeconds(address)

    onchain = {
      name:              agent.name,
      tier:              TIER[Number(agent.tier)] || 'UNKNOWN',
      status:            STATUS[Number(agent.status)] || 'UNKNOWN',
      registeredAt:      agent.registeredAt,
      lastHeartbeat:     agent.lastHeartbeat,
      totalHeartbeats:   Number(agent.totalHeartbeats),
      activeDays:        Number(agent.activeDays),
      deadAt:            agent.deadAt,
      resurrectionCount: Number(agent.resurrectionCount),
      lastBackupCid:     agent.lastBackupCid,
      lastBackupTs:      agent.lastBackupTs,
      rescueEligible:    agent.rescueEligible,
      alive,
      silenceSeconds:    Number(silence),
    }
    result.onchain = onchain
  } catch (e) {
    if (!JSON_MODE) console.log('  \x1b[33m⚠️  On-chain query failed:\x1b[0m', e.message)
    result.onchainError = e.message
  }

  // ── API status ───────────────────────────────────────────────
  let api = null
  try {
    const r = await fetch(`${API_URL}/status/${address}`, { signal: AbortSignal.timeout(8000) })
    api = await r.json()
    result.api = api
  } catch (e) {
    result.apiError = e.message
  }

  // ── Vault (on-chain) ─────────────────────────────────────────
  let vaultOnchain = null
  const vaultAddr = vaultState?.vaultAddress || api?.vaultAddress
  if (vaultAddr && vaultAddr !== '0x0000000000000000000000000000000000000000') {
    try {
      const provider = new ethers.JsonRpcProvider(RPC)
      const vault    = new ethers.Contract(vaultAddr, VAULT_ABI, provider)
      const cov      = await vault.coverages(address)
      const active   = await vault.coverageActive(address)
      const [due, dueAt] = await vault.premiumDue(address)
      const wbtc     = new ethers.Contract(WBTC_ADDR, WBTC_ABI, provider)
      const balance  = await wbtc.balanceOf(address)

      vaultOnchain = {
        vaultAddress:   vaultAddr,
        collateral:     Number(cov.collateral),
        collateralBTC:  (Number(cov.collateral) / 1e8).toFixed(8),
        coverageStart:  cov.coverageStart,
        lastPremiumPaid: cov.lastPremiumPaid,
        premiumsPaid:   Number(cov.premiumsPaid),
        seized:         cov.seized,
        cancelled:      cov.cancelled,
        coverageActive: active,
        premiumDue:     due,
        premiumDueAt:   dueAt,
        wbtcBalance:    (Number(balance) / 1e8).toFixed(8),
      }
      result.vault = vaultOnchain
    } catch (e) {
      result.vaultError = e.message
    }
  }

  // ── Heartbeat prediction ─────────────────────────────────────
  const lockDays = parseInt(process.env.KLIFE_LOCK_DAYS || '90')
  const lastBeat = onchain?.lastHeartbeat || (localBeat?.lastTs ? BigInt(Math.floor(localBeat.lastTs/1000)) : 0n)
  const nextBeatTs = lastBeat ? BigInt(Number(lastBeat)) + BigInt(lockDays * 86400) : null
  result.nextHeartbeatDue = nextBeatTs ? Number(nextBeatTs) : null

  // ── Render ───────────────────────────────────────────────────
  if (JSON_MODE) {
    console.log(JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2))
    return
  }

  // — Identity —
  if (!JSON_MODE) console.log('  \x1b[2m── Identity ────────────────────────────────────\x1b[0m')
  if (onchain) {
    fmt('Name',         onchain.name || '(unnamed)')
    fmt('Tier',         onchain.tier,  onchain.tier === 'INSURED' ? 'green' : 'yellow')
    fmt('Status',       alive ? '● ALIVE' : '● DEAD', alive ? 'green' : 'red')
    fmt('Registered',   ts(onchain.registeredAt))
    fmt('Active days',  `${onchain.activeDays} days`)
    fmt('Resurrections', onchain.resurrectionCount)
  }

  // — Heartbeat —
  console.log()
  if (!JSON_MODE) console.log('  \x1b[2m── Heartbeat ───────────────────────────────────\x1b[0m')
  if (onchain) {
    const silH = onchain.silenceSeconds
    const silColor = silH > 7 * 86400 ? 'red' : silH > 3 * 86400 ? 'yellow' : 'green'
    fmt('Last beat (chain)', ts(onchain.lastHeartbeat))
    fmt('Silence',           `${Math.floor(silH / 3600)}h ${Math.floor((silH%3600)/60)}m`, silColor)
    fmt('Total beats',       onchain.totalHeartbeats)
  }
  if (localBeat) {
    fmt('Local beat #', localBeat.beat || '—')
    fmt('Local TX',     localBeat.txHash?.slice(0,20) + '…' || '—')
  }
  if (nextBeatTs) {
    fmt('Next beat due', `${ts(nextBeatTs)} (${until(nextBeatTs)})`,
        Number(nextBeatTs) < Date.now()/1000 ? 'red' : 'cyan')
  }

  // — Pause flag —
  if (pauseState) {
    console.log()
    if (!JSON_MODE) console.log('  \x1b[2m── Heartbeat Pause ─────────────────────────────\x1b[0m')
    const pauseActive = pauseState.paused && (!pauseState.until || pauseState.until > Date.now()/1000)
    fmt('Paused',  pauseActive ? 'YES ⏸️' : 'no', pauseActive ? 'yellow' : '')
    if (pauseState.reason) fmt('Reason', pauseState.reason)
    if (pauseState.until)  fmt('Until',  ts(pauseState.until))
  }

  // — Backup —
  console.log()
  if (!JSON_MODE) console.log('  \x1b[2m── Backup (IPFS) ───────────────────────────────\x1b[0m')
  const cid = onchain?.lastBackupCid || api?.lastBackupCid || '(none)'
  const bts = onchain?.lastBackupTs  || api?.lastBackupTs  || 0
  fmt('Last CID',   cid !== '' ? cid.slice(0,20)+'…' : '(none)', cid !== '' ? 'cyan' : 'yellow')
  if (cid !== '' && cid !== '(none)') {
    fmt('Full CID',    cid)
    fmt('Backup date', ts(bts))
    fmt('IPFS link',   `https://gateway.pinata.cloud/ipfs/${cid}`)
  }
  if (onchain?.rescueEligible) fmt('Rescue eligible', 'YES ✅', 'green')

  // — Vault —
  if (vaultOnchain) {
    console.log()
    if (!JSON_MODE) console.log('  \x1b[2m── Vault (Collateral) ──────────────────────────\x1b[0m')
    fmt('Vault address', vaultAddr.slice(0,20)+'…')
    fmt('Collateral',    `${vaultOnchain.collateralBTC} WBTC (${vaultOnchain.collateral} sats)`,
        vaultOnchain.collateral > 0 ? 'green' : '')
    fmt('Coverage',      vaultOnchain.coverageActive ? 'ACTIVE ✅' : 'INACTIVE ❌',
        vaultOnchain.coverageActive ? 'green' : 'red')
    if (vaultOnchain.collateral > 0) {
      fmt('Coverage since', ts(vaultOnchain.coverageStart))
      fmt('Premiums paid',  vaultOnchain.premiumsPaid)
      fmt('Premium due',    vaultOnchain.premiumDue
          ? `YES — due ${ts(vaultOnchain.premiumDueAt)}` : `no (due ${until(vaultOnchain.premiumDueAt)})`,
          vaultOnchain.premiumDue ? 'red' : 'green')
    }
    if (vaultOnchain.seized)    fmt('SEIZED',    'YES ⚠️', 'red')
    if (vaultOnchain.cancelled) fmt('CANCELLED', 'YES',    'yellow')
    fmt('Wallet WBTC',   `${vaultOnchain.wbtcBalance} WBTC`)
  } else {
    console.log()
    if (!JSON_MODE) console.log('  \x1b[2m── Vault ───────────────────────────────────────\x1b[0m')
    fmt('Coverage', 'C = 0 — no collateral (Rescue Fund)', 'yellow')
    fmt('Rescue Fund', `${API_URL}/rescue/fund`)
  }

  console.log()
  console.log('═'.repeat(52))
  console.log()
})()
