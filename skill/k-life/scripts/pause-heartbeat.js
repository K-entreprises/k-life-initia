#!/usr/bin/env node
/**
 * K-Life — Pause / Reprendre le Heartbeat
 *
 * Pose ou lève le flag heartbeat-pause.json.
 * heartbeat.js vérifie ce fichier avant chaque envoi.
 *
 * Usage:
 *   node scripts/pause-heartbeat.js pause                  # pause indéfinie
 *   node scripts/pause-heartbeat.js pause --until 2026-04-06T08:00:00Z
 *   node scripts/pause-heartbeat.js pause --reason "Opération Pâques"
 *   node scripts/pause-heartbeat.js resume                 # reprendre
 *   node scripts/pause-heartbeat.js status                 # voir l'état
 *
 * Cas d'usage typique — Opération Pâques :
 *   node scripts/pause-heartbeat.js pause \
 *     --until 2026-04-06T08:00:00Z \
 *     --reason "Opération Pâques — mort volontaire pour demo"
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { resolve } from 'path'

const PAUSE_FILE = resolve('heartbeat-pause.json')

function ts(unix) {
  if (!unix) return 'permanent'
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function isPauseActive(p) {
  if (!p?.paused) return false
  if (p.until && p.until < Date.now() / 1000) return false // expired
  return true
}

// ── Parse args ──────────────────────────────────────────────────────────────
const [,, command, ...rest] = process.argv

const untilArg   = rest.find((_, i, a) => a[i-1] === '--until')
const reasonArg  = rest.find((_, i, a) => a[i-1] === '--reason')

function parseUntil(str) {
  if (!str) return null
  const d = new Date(str)
  if (isNaN(d)) { console.error(`❌ Date invalide: ${str}`); process.exit(1) }
  return Math.floor(d.getTime() / 1000)
}

// ── Commands ────────────────────────────────────────────────────────────────

if (!command || command === 'status') {
  // Show current state
  if (!existsSync(PAUSE_FILE)) {
    console.log('\n⏵  Heartbeat ACTIF — aucun flag de pause\n')
    process.exit(0)
  }
  let p
  try { p = JSON.parse(readFileSync(PAUSE_FILE, 'utf8')) } catch {
    console.error('❌ heartbeat-pause.json corrompu'); process.exit(1)
  }
  const active = isPauseActive(p)
  console.log('\n🏥 Heartbeat Pause Status')
  console.log('═'.repeat(40))
  console.log(`   Status  : ${active ? '⏸️  EN PAUSE' : '⏵  expiré (inactif)'}`)
  console.log(`   Paused  : ${p.paused}`)
  console.log(`   Reason  : ${p.reason || '—'}`)
  console.log(`   Depuis  : ${ts(p.pausedAt)}`)
  console.log(`   Jusqu'à : ${ts(p.until)}`)
  if (p.cancelTx) console.log(`   Cancel TX: ${p.cancelTx}`)
  console.log()

} else if (command === 'pause') {
  const until  = parseUntil(untilArg)
  const reason = reasonArg || 'manual pause'

  const existing = existsSync(PAUSE_FILE)
    ? JSON.parse(readFileSync(PAUSE_FILE, 'utf8')) : {}

  const pause = {
    ...existing,
    paused:   true,
    reason,
    pausedAt: Math.floor(Date.now() / 1000),
    until:    until || null,
  }
  writeFileSync(PAUSE_FILE, JSON.stringify(pause, null, 2))

  console.log('\n⏸️  Heartbeat mis en PAUSE')
  console.log('═'.repeat(40))
  console.log(`   Reason  : ${reason}`)
  console.log(`   Depuis  : ${ts(pause.pausedAt)}`)
  console.log(`   Jusqu'à : ${ts(until)}`)
  console.log()
  console.log('   heartbeat.js ne renverra aucune TX tant que ce flag est actif.')
  console.log('   Pour reprendre : node scripts/pause-heartbeat.js resume')
  console.log()

} else if (command === 'resume') {
  if (!existsSync(PAUSE_FILE)) {
    console.log('\n⏵  Heartbeat déjà actif — aucun flag de pause\n')
    process.exit(0)
  }

  let p
  try { p = JSON.parse(readFileSync(PAUSE_FILE, 'utf8')) } catch { p = {} }

  p.paused    = false
  p.resumedAt = Math.floor(Date.now() / 1000)
  writeFileSync(PAUSE_FILE, JSON.stringify(p, null, 2))

  console.log('\n⏵  Heartbeat REPRIS')
  console.log('═'.repeat(40))
  console.log(`   Repris à : ${ts(p.resumedAt)}`)
  console.log()
  console.log('   heartbeat.js reprendra à la prochaine exécution.')
  console.log('   Lance-le manuellement : node scripts/heartbeat.js --once')
  console.log()

} else {
  console.log(`
Usage:
  node scripts/pause-heartbeat.js status
  node scripts/pause-heartbeat.js pause [--until <ISO date>] [--reason "..."]
  node scripts/pause-heartbeat.js resume

Exemples:
  node scripts/pause-heartbeat.js pause --reason "Opération Pâques"
  node scripts/pause-heartbeat.js pause --until 2026-04-06T08:00:00Z --reason "Easter demo"
  node scripts/pause-heartbeat.js resume
`)
}
