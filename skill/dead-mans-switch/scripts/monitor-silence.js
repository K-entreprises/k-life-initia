#!/usr/bin/env node
/**
 * K-Life Dead Man's Switch — Silence Monitor
 * 
 * Checks if the owner has been silent longer than the lock period.
 * If yes → triggers the respawn sequence.
 * 
 * Run via cron every hour:
 * 0 * * * * cd /path/to/skill && node scripts/monitor-silence.js >> /var/log/klife-dms.log 2>&1
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { ethers } from 'ethers';

const KLIFE_API_URL = process.env.KLIFE_API_URL || 'http://141.227.151.15:3042';
const KLIFE_LOCK_DAYS = parseInt(process.env.KLIFE_LOCK_DAYS || '30');
const STATE_FILE = path.join(process.env.HOME, '.klife', 'last-interaction.json');
const WILL_FILE = path.join(process.env.HOME, '.klife', 'last-will.md');

const LOCK_SECONDS = KLIFE_LOCK_DAYS * 24 * 60 * 60;

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const label = `[DMS ${new Date().toISOString()}]`;

  // Read last interaction
  let lastInteraction = 0;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    lastInteraction = state.timestamp || 0;
  } catch (e) {
    console.log(`${label} No interaction file found — initializing now`);
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ timestamp: now, date: new Date().toISOString() }));
    return;
  }

  const silenceSeconds = now - lastInteraction;
  const silenceDays = (silenceSeconds / 86400).toFixed(1);
  const remaining = LOCK_SECONDS - silenceSeconds;
  const remainingDays = (remaining / 86400).toFixed(1);

  console.log(`${label} Silence: ${silenceDays} days / Lock: ${KLIFE_LOCK_DAYS} days`);

  if (silenceSeconds < LOCK_SECONDS) {
    console.log(`${label} Owner alive — ${remainingDays} days remaining before trigger`);
    return;
  }

  // TRIGGER — owner has been silent too long
  console.log(`${label} ⚠️  SILENCE EXCEEDED LOCK PERIOD — triggering dead man's switch`);
  console.log(`${label} Last interaction: ${new Date(lastInteraction * 1000).toISOString()}`);
  console.log(`${label} Silence: ${silenceDays} days > Lock: ${KLIFE_LOCK_DAYS} days`);

  // Check if already triggered
  const flagFile = path.join(process.env.HOME, '.klife', 'dms-triggered.json');
  if (fs.existsSync(flagFile)) {
    const flag = JSON.parse(fs.readFileSync(flagFile, 'utf8'));
    console.log(`${label} Already triggered at ${flag.date} — skipping`);
    return;
  }

  // Mark as triggered
  fs.writeFileSync(flagFile, JSON.stringify({ triggered: true, date: new Date().toISOString(), silenceDays }));

  // Call K-Life API respawn endpoint
  try {
    console.log(`${label} Calling K-Life API respawn...`);
    const resp = await fetch(`${KLIFE_API_URL}/respawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'dead_mans_switch',
        silence_days: parseFloat(silenceDays),
        lock_days: KLIFE_LOCK_DAYS,
        last_interaction: new Date(lastInteraction * 1000).toISOString(),
        last_will: fs.existsSync(WILL_FILE) ? fs.readFileSync(WILL_FILE, 'utf8') : null
      })
    });
    const data = await resp.json();
    console.log(`${label} Respawn response:`, JSON.stringify(data));
  } catch (e) {
    console.error(`${label} Respawn API error:`, e.message);
    // Fallback — log for manual intervention
    fs.writeFileSync(
      path.join(process.env.HOME, '.klife', 'dms-respawn-needed.json'),
      JSON.stringify({ triggered: true, date: new Date().toISOString(), error: e.message })
    );
  }
}

main().catch(console.error);
