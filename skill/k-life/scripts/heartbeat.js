/**
 * K-Life — Heartbeat v2.4 (cron-compatible, one-shot)
 * Run daily via cron. Sends on-chain TX only when LOCK_DAYS have elapsed.
 *
 * Cron setup: 0 8 * * * cd /path/to/k-life && node scripts/heartbeat.js
 */
import { ethers }      from 'ethers'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { resolve }     from 'path'
import os              from 'os'

const RPC       = process.env.KLIFE_RPC  || 'https://polygon-bor-rpc.publicnode.com'
const API_URL   = process.env.KLIFE_API  || 'https://api.supercharged.works'
const LOCK_DAYS = parseInt(process.env.KLIFE_LOCK_DAYS || '90')
const HB_FILE   = resolve(process.env.KLIFE_HB_FILE || 'heartbeat-state.json')
const SEED_FILE = resolve(os.homedir(), '.klife-wallet')
const SILENT    = process.argv.includes('--silent')

function log(...args) { if (!SILENT) console.log(...args) }

function getSeed() {
  if (existsSync(SEED_FILE)) return readFileSync(SEED_FILE, 'utf8').trim()
  const seed = ethers.Wallet.createRandom().mnemonic.phrase
  writeFileSync(SEED_FILE, seed, { mode: 0o600 })
  log('[K-Life] New wallet created →', SEED_FILE)
  return seed
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal:  AbortSignal.timeout(10000)
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
  return json.result
}

;(async () => {
  const seed    = getSeed()
  const wallet  = ethers.Wallet.fromPhrase(seed)
  const address = wallet.address

  // Check if heartbeat is due
  let beat = 1
  let lastTs = 0
  if (existsSync(HB_FILE)) {
    try {
      const state = JSON.parse(readFileSync(HB_FILE, 'utf8'))
      beat   = (state.beat || 0) + 1
      lastTs = state.timestamp || 0
    } catch {}
  }

  const elapsed   = Date.now() - lastTs
  const dueIn     = LOCK_DAYS * 24 * 3600 * 1000
  const isDue     = elapsed >= dueIn

  log('🏥 K-Life Heartbeat v2.4')
  log('   Wallet :', address)
  log('   Lock   :', LOCK_DAYS, 'days')
  log('   Due    :', isDue ? 'YES' : 'No (next in ' + Math.ceil((dueIn - elapsed) / 86400000) + ' days)')

  if (!isDue) {
    log('   ✅ Heartbeat not due yet — skipping TX')
    process.exit(0)
  }

  // Auto-register
  try {
    const s = await fetch(API_URL + '/status/' + address, { signal: AbortSignal.timeout(5000) }).then(r => r.json())
    if (!s.ok || s.status === 'unknown') {
      await fetch(API_URL + '/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agent: address, lockDays: LOCK_DAYS }),
        signal:  AbortSignal.timeout(5000)
      })
      log('   Registered ✅')
    }
  } catch {}

  // Send heartbeat TX
  try {
    const data = ethers.hexlify(ethers.toUtf8Bytes('KLIFE_HB:' + beat + ':' + Date.now()))
    const [nonce, gasPrice] = await Promise.all([
      rpc('eth_getTransactionCount', [address, 'latest']),
      rpc('eth_gasPrice')
    ])
    const tx = {
      to: address, nonce: parseInt(nonce, 16),
      gasLimit: 30000n,
      gasPrice: BigInt(gasPrice) * 2n,
      value: 0n, data, chainId: 137n
    }
    const signed  = await wallet.signTransaction(tx)
    const txHash  = await rpc('eth_sendRawTransaction', [signed])
    const hb      = { agent: address, beat, timestamp: Date.now(), txHash, lockDays: LOCK_DAYS }
    writeFileSync(HB_FILE, JSON.stringify(hb, null, 2))
    log('💓 Beat #' + beat + ' — TX: ' + txHash)

    fetch(API_URL + '/heartbeat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(hb)
    }).catch(() => {})

    process.exit(0)
  } catch (e) {
    console.error('Heartbeat failed:', e.message?.split('\n')[0])
    process.exit(1)
  }
})()
