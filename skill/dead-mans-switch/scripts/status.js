#!/usr/bin/env node
/**
 * K-Life Dead Man's Switch — Status
 * Shows current silence status, time remaining, last will info.
 */

import fs from 'fs';
import path from 'path';

const STATE_DIR = path.join(process.env.HOME, '.klife');
const STATE_FILE = path.join(STATE_DIR, 'last-interaction.json');
const WILL_STATE  = path.join(STATE_DIR, 'will-state.json');
const FLAG_FILE   = path.join(STATE_DIR, 'dms-triggered.json');
const LOCK_DAYS   = parseInt(process.env.KLIFE_LOCK_DAYS || '30');

const now = Math.floor(Date.now() / 1000);

console.log('');
console.log('🔥 K-Life Dead Man\'s Switch — Status');
console.log('─────────────────────────────────────');

// Last interaction
try {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const silenceSec = now - state.timestamp;
  const silenceDays = (silenceSec / 86400).toFixed(1);
  const remaining = (LOCK_DAYS - silenceSec / 86400).toFixed(1);
  const pct = Math.min(100, (silenceSec / (LOCK_DAYS * 86400)) * 100).toFixed(0);

  console.log(`Last interaction : ${state.date}`);
  console.log(`Silence          : ${silenceDays} days`);
  console.log(`Lock period      : ${LOCK_DAYS} days`);
  console.log(`Time remaining   : ${remaining > 0 ? remaining + ' days' : '⚠️  EXPIRED'}`);
  console.log(`Progress         : [${'█'.repeat(Math.floor(pct/5))}${'░'.repeat(20-Math.floor(pct/5))}] ${pct}%`);
} catch(e) {
  console.log('Last interaction : never recorded');
}

// Last will
console.log('');
try {
  const will = JSON.parse(fs.readFileSync(WILL_STATE, 'utf8'));
  console.log(`Last Will        : set on ${will.set_at}`);
  console.log(`Preview          : "${will.message_preview}"`);
  if (will.ipfs_cid) console.log(`IPFS             : ${will.ipfs_url}`);
} catch(e) {
  console.log('Last Will        : ⚠️  not set — run: node scripts/set-last-will.js');
}

// Trigger status
console.log('');
if (fs.existsSync(FLAG_FILE)) {
  const flag = JSON.parse(fs.readFileSync(FLAG_FILE, 'utf8'));
  console.log(`🚨 TRIGGERED      : ${flag.date} (silence: ${flag.silenceDays} days)`);
} else {
  console.log('Switch status    : ✅ armed — owner alive');
}
console.log('');
