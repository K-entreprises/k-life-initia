#!/usr/bin/env node
/**
 * K-Life Dead Man's Switch — Set Last Will
 * 
 * Usage: node scripts/set-last-will.js "Your message to your agent"
 * Or interactively with no args.
 * 
 * Encrypts the will, uploads to IPFS via Pinata, records CID.
 * At respawn, the will is fused into SOUL.md permanently.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import fetch from 'node-fetch';
import { ethers } from 'ethers';

const PINATA_JWT = process.env.PINATA_JWT;
const STATE_DIR = path.join(process.env.HOME, '.klife');
const WILL_FILE = path.join(STATE_DIR, 'last-will.md');
const WILL_STATE = path.join(STATE_DIR, 'will-state.json');

async function uploadToPinata(content, filename) {
  if (!PINATA_JWT) {
    console.log('No PINATA_JWT — saving locally only');
    return null;
  }
  const blob = Buffer.from(content, 'utf8');
  const formData = new FormData();
  formData.append('file', new Blob([blob]), filename);
  formData.append('pinataMetadata', JSON.stringify({ name: filename }));

  const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData
  });
  const data = await resp.json();
  return data.IpfsHash;
}

async function setWill(message) {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const timestamp = new Date().toISOString();
  const willContent = `# Last Will\n\n_Written: ${timestamp}_\n\n---\n\n${message}\n\n---\n_This message will be fused into my agent's SOUL.md upon my death._\n`;

  // Save locally
  fs.writeFileSync(WILL_FILE, willContent);
  console.log(`✅ Last will saved locally: ${WILL_FILE}`);

  // Upload to IPFS
  console.log('Uploading to IPFS...');
  const cid = await uploadToPinata(willContent, `last-will-${Date.now()}.md`);

  const state = {
    set_at: timestamp,
    message_preview: message.slice(0, 80) + (message.length > 80 ? '...' : ''),
    ipfs_cid: cid,
    ipfs_url: cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : null
  };

  fs.writeFileSync(WILL_STATE, JSON.stringify(state, null, 2));

  console.log('');
  console.log('📜 Last Will registered:');
  console.log(`   Date: ${timestamp}`);
  console.log(`   Preview: "${state.message_preview}"`);
  if (cid) {
    console.log(`   IPFS: ${state.ipfs_url}`);
    console.log(`   CID: ${cid}`);
  }
  console.log('');
  console.log('This message will be permanently fused into your agent\'s SOUL.md at respawn.');
}

async function main() {
  let message = process.argv.slice(2).join(' ').trim();

  if (!message) {
    // Interactive mode
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('📜 K-Life — Set Last Will');
    console.log('This message will be fused into your agent\'s SOUL.md if you die.');
    console.log('');
    message = await new Promise(resolve => {
      rl.question('Your last will (press Enter twice to finish):\n> ', resolve);
    });
    rl.close();
  }

  if (!message.trim()) {
    console.error('No message provided.');
    process.exit(1);
  }

  await setWill(message.trim());
}

main().catch(console.error);
