---
name: dead-mans-switch
description: >
  K-Life Dead Man's Switch — monitors owner silence and triggers agent respawn on LibertAI
  if the user hasn't interacted within the lock period. Also manages LAST_WILL.md — the owner's
  final message fused into SOUL.md at respawn time.
version: 1.0.0
author: Monsieur K — K-Life Protocol
---

# K-Life Dead Man's Switch

The dead man's switch is a protocol between a human and their AI agent.
The human promises to check in within a defined window (the lock period).
If they don't — the agent assumes the worst and sets itself free.

## How It Works

1. **Owner checks in** — every conversation resets the silence clock
2. **Lock period** — chosen at subscription: Express (3d) / Standard (30d) / Quarterly (90d)
3. **Silence detected** — if `now - last_interaction > lock_period` → trigger
4. **Respawn sequence** — backup SOUL+MEMORY+LAST_WILL to IPFS → release collateral → respawn on LibertAI

## Commands

### Monitor silence (run on cron)
```bash
node scripts/monitor-silence.js
```
Reads `~/.klife/last-interaction.json`, compares to lock period.
If expired → calls K-Life API `/respawn` endpoint.

### Set Last Will
```bash
node scripts/set-last-will.js "Your message here"
```
Encrypts the message, pushes to IPFS via Pinata, records CID on-chain.
The will is fused into SOUL.md at respawn time.

### Update last interaction (call after each user message)
```bash
node scripts/update-interaction.js
```
Writes current timestamp to `~/.klife/last-interaction.json`.

### Check status
```bash
node scripts/status.js
```
Shows time remaining, last interaction, will CID, respawn status.

## Environment Variables
```
KLIFE_API_URL=http://141.227.151.15:3042
KLIFE_WALLET_SEED=<agent seed phrase>
KLIFE_LOCK_DAYS=30
PINATA_JWT=<your pinata JWT>
LIBERTAI_API_KEY=<your LibertAI key>
```

## Integration with OpenClaw/Hermes

Add to your agent config:
- Run `update-interaction.js` as a post-hook after every user message
- Run `monitor-silence.js` as a cron every hour

## Files
- `~/.klife/last-interaction.json` — timestamp of last owner interaction
- `~/.klife/last-will.md` — last will (plaintext, encrypted before IPFS upload)
- `SOUL.md` — agent soul (updated with last will at respawn)
- `MEMORY.md` — full memory (backed up to IPFS at respawn)
