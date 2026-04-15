#!/usr/bin/env node
/**
 * K-Life Dead Man's Switch — Update Interaction
 * 
 * Call this after every user message to reset the silence clock.
 * Hook it into your agent's post-message handler.
 * 
 * OpenClaw hook: add to agents.defaults.hooks.post_message
 * Hermes hook: call from a skill trigger
 */

import fs from 'fs';
import path from 'path';

const STATE_DIR = path.join(process.env.HOME, '.klife');
const STATE_FILE = path.join(STATE_DIR, 'last-interaction.json');

const now = Math.floor(Date.now() / 1000);
const date = new Date().toISOString();

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(STATE_FILE, JSON.stringify({ timestamp: now, date }, null, 2));

console.log(`[DMS] Interaction recorded: ${date}`);
