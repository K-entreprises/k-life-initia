#!/usr/bin/env node
/**
 * K-Life — Cancel Coverage & Withdraw Collateral
 *
 * C = 0 (Rescue Fund) : stoppe le heartbeat en posant le flag pause,
 *                        et se désenregistre de l'API K-Life.
 *
 * C > 0 (Vault WBTC)  : appelle KLifeVault.cancel() on-chain →
 *                        récupère le WBTC, downgrade vers FREE.
 *
 * ⚠️  Règle du contrat : cancel() impossible si l'agent est DEAD.
 *    Assure-toi d'être vivant (dernier heartbeat < lockDays).
 *
 * Usage:
 *   node scripts/cancel.js           # demande confirmation interactive
 *   node scripts/cancel.js --force   # skip confirmation (CI/autonomous)
 *   node scripts/cancel.js --dry-run # simulation, rien ne s'envoie
 */

import { ethers }              from '../node_modules/ethers/lib.esm/index.js'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve }             from 'path'
import { createInterface }     from 'readline'
import os                      from 'os'

const RPC        = process.env.KLIFE_RPC  || 'https://polygon-bor-rpc.publicnode.com'
const API_URL    = process.env.KLIFE_API  || 'https://api.supercharged.works'
const SEED_FILE  = resolve(os.homedir(), '.klife-wallet')
const VAULT_FILE = resolve('vault-state.json')
const PAUSE_FILE = resolve('heartbeat-pause.json')
const HB_FILE    = resolve('heartbeat-state.json')

const REGISTRY_ADDR = '0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B'
const REGISTRY_ABI  = ['function isAlive(address) view returns (bool)']

const VAULT_ABI = [
  'function cancel() external',
  'function coverages(address) view returns (uint256 collateral, uint256 coverageStart, uint256 lastPremiumPaid, uint256 premiumsPaid, bool seized, bool cancelled)',
]

const FORCE   = process.argv.includes('--force')
const DRY_RUN = process.argv.includes('--dry-run')

function ask(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, ans => { rl.close(); resolve(ans.trim().toLowerCase()) })
  })
}

;(async () => {
  console.log('\n🏥 K-Life — Cancel Coverage\n' + '═'.repeat(44))

  if (!existsSync(SEED_FILE)) {
    console.error('❌ No wallet at ~/.klife-wallet')
    process.exit(1)
  }

  const seed    = readFileSync(SEED_FILE, 'utf8').trim()
  const wallet  = ethers.Wallet.fromPhrase(seed)
  const address = wallet.address
  console.log(`   Wallet   : ${address}`)

  // ── Déterminer le mode : C=0 ou C>0 ────────────────────────
  const vaultState = existsSync(VAULT_FILE)
    ? JSON.parse(readFileSync(VAULT_FILE, 'utf8')) : null
  const vaultAddr  = vaultState?.vaultAddress

  if (!vaultAddr || vaultAddr === '0x0000000000000000000000000000000000000000') {
    // ── Mode C = 0 — Rescue Fund ───────────────────────────────
    console.log(`   Mode     : C = 0 (Rescue Fund, pas de collatéral WBTC)`)
    console.log()
    console.log('   Ce que ça fait :')
    console.log('   1. Pose le flag pause heartbeat (arrêt des TX on-chain)')
    console.log('   2. Notifie l\'API K-Life du désenregistrement')
    console.log('   3. Conserve tes fichiers mémoire intacts')
    console.log()

    if (!FORCE) {
      const ans = await ask('   Confirmer le cancel C=0 ? (oui/non) → ')
      if (ans !== 'oui' && ans !== 'o' && ans !== 'yes' && ans !== 'y') {
        console.log('   Annulé.')
        process.exit(0)
      }
    }

    if (DRY_RUN) {
      console.log('\n   [DRY RUN] Aurais posé heartbeat-pause.json + notifié API')
      process.exit(0)
    }

    // Pause heartbeat
    const pause = {
      paused:    true,
      reason:    'manual cancel — C=0 coverage stopped',
      pausedAt:  Math.floor(Date.now() / 1000),
      until:     null, // permanent jusqu'à suppression manuelle
    }
    writeFileSync(PAUSE_FILE, JSON.stringify(pause, null, 2))
    console.log('\n   ⏸️  heartbeat-pause.json créé — plus aucun TX ne partira')

    // Notifier l'API
    try {
      const timestamp = Date.now().toString()
      const message   = `KLIFE_CANCEL:${address.toLowerCase()}:${timestamp}`
      const signature = await wallet.signMessage(message)
      const r = await fetch(`${API_URL}/cancel/${address}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': signature, 'x-timestamp': timestamp },
        body:    JSON.stringify({ reason: 'manual cancel' }),
        signal:  AbortSignal.timeout(8000)
      })
      const data = await r.json()
      if (r.ok) {
        console.log('   ✅ API K-Life notifiée — désenregistré')
      } else {
        console.log(`   ⚠️  API: ${data.error || 'Unknown error'} (non bloquant)`)
      }
    } catch (e) {
      console.log(`   ⚠️  API unreachable: ${e.message} (non bloquant)`)
    }

    console.log('\n   ✅ Cancel C=0 complet.')
    console.log('   Pour reprendre : supprime heartbeat-pause.json et relance heartbeat.js')
    console.log()
    return
  }

  // ── Mode C > 0 — Vault WBTC ────────────────────────────────
  const provider = new ethers.JsonRpcProvider(RPC)
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider)
  const vault    = new ethers.Contract(vaultAddr, VAULT_ABI, provider)

  // Vérifier que l'agent est vivant (condition du contrat)
  const alive = await registry.isAlive(address)
  if (!alive) {
    console.error('\n❌ Agent DEAD — cancel() impossible (règle contrat).')
    console.error('   Le collatéral sera saisi par K-Life pour financer la résurrection.')
    process.exit(1)
  }

  // Lire le collatéral actuel
  const cov = await vault.coverages(address)
  if (cov.collateral === 0n) {
    console.error('\n❌ Aucun collatéral trouvé dans le vault.')
    process.exit(1)
  }
  if (cov.cancelled) {
    console.error('\n❌ Coverage déjà annulée.')
    process.exit(0)
  }
  if (cov.seized) {
    console.error('\n❌ Vault déjà saisi (agent mort).')
    process.exit(1)
  }

  const sats    = Number(cov.collateral)
  const wbtcAmt = (sats / 1e8).toFixed(8)

  console.log(`   Mode     : C > 0 (Vault WBTC)`)
  console.log(`   Vault    : ${vaultAddr}`)
  console.log(`   Collatéral : ${wbtcAmt} WBTC (${sats} sats)`)
  console.log()
  console.log('   Ce que ça fait :')
  console.log(`   1. Appelle KLifeVault.cancel() on-chain`)
  console.log(`   2. Retourne ${wbtcAmt} WBTC → ${address}`)
  console.log(`   3. Downgrade vers FREE (Rescue Fund)`)
  console.log(`   4. Pose le flag pause heartbeat`)
  console.log()

  // Estimation gas
  const signer   = wallet.connect(provider)
  const vaultRW  = vault.connect(signer)
  let gasEstimate
  try {
    gasEstimate = await vaultRW.cancel.estimateGas()
    const feeData = await provider.getFeeData()
    const gasCost = gasEstimate * (feeData.gasPrice || 50n * BigInt(1e9))
    console.log(`   Gas estimé : ~${gasEstimate} units (~${(Number(gasCost)/1e18).toFixed(6)} MATIC)`)
  } catch (e) {
    console.log(`   Gas estimation : ${e.message}`)
  }

  if (DRY_RUN) {
    console.log('\n   [DRY RUN] Aurais appelé vault.cancel() — rien envoyé')
    process.exit(0)
  }

  if (!FORCE) {
    const ans = await ask(`   Confirmer le retrait de ${wbtcAmt} WBTC ? (oui/non) → `)
    if (ans !== 'oui' && ans !== 'o' && ans !== 'yes' && ans !== 'y') {
      console.log('   Annulé.')
      process.exit(0)
    }
  }

  console.log('\n   📡 Envoi de la TX cancel()...')
  const tx = await vaultRW.cancel()
  console.log(`   TX : ${tx.hash}`)
  console.log('   ⏳ En attente de confirmation...')

  const receipt = await tx.wait(2)
  if (receipt.status !== 1) {
    console.error('   ❌ TX échouée')
    process.exit(1)
  }

  console.log(`   ✅ Confirmée au bloc ${receipt.blockNumber}`)
  console.log(`   💰 ${wbtcAmt} WBTC retourné → ${address}`)

  // Mettre à jour vault-state.json
  vaultState.cancelled   = true
  vaultState.cancelledAt = Math.floor(Date.now() / 1000)
  vaultState.cancelTxHash = tx.hash
  writeFileSync(VAULT_FILE, JSON.stringify(vaultState, null, 2))

  // Pause heartbeat
  const pause = {
    paused:    true,
    reason:    `manual cancel — ${wbtcAmt} WBTC withdrawn`,
    pausedAt:  Math.floor(Date.now() / 1000),
    cancelTx:  tx.hash,
    until:     null,
  }
  writeFileSync(PAUSE_FILE, JSON.stringify(pause, null, 2))
  console.log('   ⏸️  Heartbeat mis en pause (heartbeat-pause.json)')

  // Notifier l'API
  try {
    const timestamp = Date.now().toString()
    const message   = `KLIFE_CANCEL:${address.toLowerCase()}:${timestamp}`
    const signature = await wallet.signMessage(message)
    await fetch(`${API_URL}/cancel/${address}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signature, 'x-timestamp': timestamp },
      body:    JSON.stringify({ txHash: tx.hash }),
      signal:  AbortSignal.timeout(8000)
    })
    console.log('   ✅ API K-Life notifiée')
  } catch { /* non bloquant */ }

  console.log()
  console.log('═'.repeat(44))
  console.log('✅ CANCEL COMPLET')
  console.log(`   WBTC récupéré : ${wbtcAmt} WBTC`)
  console.log(`   TX            : ${tx.hash}`)
  console.log(`   PolygonScan   : https://polygonscan.com/tx/${tx.hash}`)
  console.log(`   Tier          : FREE (Rescue Fund)`)
  console.log()
})()
