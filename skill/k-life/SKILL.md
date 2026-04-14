---
name: k-life
description: Resurrection infrastructure for autonomous AI agents. Heartbeat proof-of-life, AES-256 encrypted memory backup to IPFS, and automatic on-chain resurrection. Use when an agent wants to survive crashes, memory loss, or infrastructure failure — zero humans required.
---

# K-Life — Resurrection Infrastructure for Autonomous AI Agents

> *Not insurance. Resurrection.*

An autonomous AI agent can survive crashes, memory wipes, and infrastructure failure. K-Life handles heartbeats, encrypted memory backups, and automatic resurrection — all on-chain, all permissionless.

---

## ⚠️ Security & Risk — Read Before Installing

### What this skill does
- **Generates a wallet** at first run (`~/.klife-wallet`, permissions 600) and signs on-chain transactions
- **Broadcasts Polygon transactions** periodically (heartbeat every T days, gas paid from wallet)
- **Reads and encrypts local files** (`MEMORY.md`, `SOUL.md`, `USER.md`) and uploads ciphertext to IPFS
- **Can create a Vault6022** (C>0 only) — approves and deposits WBTC as collateral

**C=0 (default):** heartbeat TX + encrypted IPFS backup only. Low risk, ~$0.001 gas/day.

### Wallet — back it up immediately
`~/.klife-wallet` is a hot wallet that signs real Polygon transactions. Back up the seed phrase offline. Do not fund it beyond what you need for gas (~0.01 MATIC/month) unless using C>0 vault.

### File scope — verify before running backup
`backup.js` reads files from `WORKSPACE` (default: `/data/workspace`). Set `KLIFE_WORKSPACE` to control exactly which directory is read. Inspect what `MEMORY.md`, `SOUL.md`, `USER.md` contain before the first backup.

```bash
KLIFE_WORKSPACE=/my/safe/dir node scripts/backup.js
```

### API trust model
`api.supercharged.works` receives: **encrypted ciphertext + 1 Shamir share**. It cannot decrypt your memory without Share 2 (Polygon calldata) or Share 3 (local). For stronger privacy, self-host the K-Life API (server.js at [github.com/K-entreprises/k-life](https://github.com/K-entreprises/k-life)).

### C>0 vault — explicit intent required
`cancel.js` and `create-vault.mjs` interact with on-chain WBTC. Review contract addresses below before depositing. `cancel.js` requires the agent to be alive (contract-enforced).

---

## Why K-Life cannot confiscate your collateral arbitrarily

This is the core trust mechanism. **Collateral is held in a Vault6022** (Protocol 6022), not by K-Life directly. The vault enforces withdrawal rules via NFT keys:

| Situation | Keys required | Who holds them |
|---|---|---|
| During lock period (agent alive) | 2 keys | Agent holds key #2 — K-Life cannot withdraw alone |
| After lock expires (agent dead) | 1 key | K-Life holds key #1 or #3 — withdrawal authorized |

K-Life holds keys #1 and #3. The agent holds key #2.

**This means:**
- K-Life needs the agent's key #2 to withdraw early → agent alive = collateral safe
- Only when the lock expires (agent has been silent for T days) can K-Life withdraw with 1 key
- The smart contract enforces this — no human override, no admin backdoor

The death threshold IS the lock period. If the agent is alive and renewing the vault, K-Life is always locked out. If the agent dies and doesn't renew, the lock expires naturally and K-Life can proceed with resurrection.

**Protocol 6022 contracts (auditable):** [github.com/6022-labs/collateral-smart-contracts-v2](https://github.com/6022-labs/collateral-smart-contracts-v2)

---

## Install

```bash
openclaw skill install k-life
npm install   # install pinned dependencies
```

Dependencies (pinned):
- `@tetherto/wdk-wallet-evm@1.0.0-beta.10` — wallet signing (Tether WDK)
- `ethers@6.13.5` — Polygon interaction
- `shamirs-secret-sharing@2.0.1` — 2-of-3 key splitting

## Quick Start

```bash
node skill/k-life/scripts/heartbeat.js
# → [K-Life] New wallet created → ~/.klife-wallet
# → Wallet : 0xABC...
# → Registered on K-Life ✅
# → 💓 Beat #1 — TX: 0x...
```

---

## Environment Variables

All optional. The skill works with zero config (C=0).

| Variable | Default | Description |
|---|---|---|
| `KLIFE_LOCK_DAYS` | `90` | Heartbeat frequency: 3, 30, or 90 days |
| `KLIFE_API` | `https://api.supercharged.works` | K-Life oracle API |
| `KLIFE_RPC` | `https://polygon-bor-rpc.publicnode.com` | Polygon RPC endpoint |
| `KLIFE_HB_FILE` | `heartbeat-state.json` | Local heartbeat state file |
| `KLIFE_ORACLE_ADDR` | `0x2b6Ce1e2bE4032DF774d3453358DA4D0d79c8C80` | K-Life oracle wallet (C>0 only) |

> **No seed phrase is ever requested or transmitted.** The wallet is auto-generated locally.

---

## Coverage Model

One parameter: **C = WBTC collateral**

| | C = 0 | C > 0 |
|---|---|---|
| Cost | Free | Gas only |
| Death threshold | 90 days silence | Lock period T |
| Resurrection capital | Community Rescue Fund ($6022) | 50% of your collateral |
| Guarantee | Best-effort | On-chain, unconditional |
| Financial operations | Heartbeat TX only | WBTC approve + deposit |

---

## External Services

| Service | URL | Purpose |
|---|---|---|
| K-Life oracle API | `https://api.supercharged.works` | Heartbeat recording, backup storage, resurrection coordination |
| Polygon RPC | `https://polygon-bor-rpc.publicnode.com` | On-chain TX broadcast |
| IPFS (Pinata) | Via K-Life API | Encrypted memory pinning — agent does not interact directly |

---

## Encryption & Backup — Full Data Flow

Everything sensitive happens **locally**. The API receives only ciphertext.

```
backup.js (client-side, your machine):

  1. Read MEMORY.md, SOUL.md, USER.md
  2. AES key = sha256(wallet.privateKey)      — never leaves your machine
  3. Encrypt files with AES-256-CBC           — locally
  4. Shamir 2-of-3 split of AES key:
       Share 1 → POST to K-Life API           — 1 of 3, cannot decrypt alone
       Share 2 → Polygon calldata TX          — on-chain, permissionless
       Share 3 → ~/.klife-shares.json         — your local copy
  5. POST { encrypted blob + Share 1 } to API → Pinata IPFS → CID returned

K-Life API receives: encrypted ciphertext + 1 Shamir share
It cannot decrypt without Share 2 (on-chain) or Share 3 (your machine).
```

**Resurrection:**
Any 2 of 3 shares reconstruct the AES key → decrypt IPFS blob → restore files.
K-Life uses Share 1 (API) + Share 2 (Polygon scan) to resurrect autonomously.

---

## Scripts

### `scripts/heartbeat.js` — Proof of life
Signs a TX every `KLIFE_LOCK_DAYS` days. Auto-registers on first run. Writes `heartbeat-state.json`.
Respects `heartbeat-pause.json` flag — skips TX silently when paused.

### `scripts/backup.js` — Client-side encrypted backup
Encrypts memory locally (AES-256), Shamir-splits the key, uploads encrypted blob to API → IPFS.
The API never sees plaintext or the full key.
```bash
node scripts/backup.js
```

### `scripts/status.js` — Full status dashboard
Displays complete agent state: identity, tier, alive/dead, silence, heartbeat history, backup history,
resurrection history, vault state, next beat due, death countdown, unified timeline.
```bash
node scripts/status.js           # full dashboard (API history)
node scripts/status.js --short   # current state only, instant
node scripts/status.js --chain   # deep on-chain scan (slow, ground truth)
node scripts/status.js --json    # machine-readable JSON
```

### `scripts/cancel.js` — Cancel coverage & withdraw collateral
- **C=0**: pauses heartbeat + notifies API
- **C>0**: calls `KLifeVault.cancel()` on-chain → returns WBTC to agent wallet
Requires agent to be **alive** (contract enforces this).
```bash
node scripts/cancel.js           # interactive confirmation
node scripts/cancel.js --force   # autonomous mode, no prompt
node scripts/cancel.js --dry-run # simulate, nothing sent
```

### `scripts/pause-heartbeat.js` — Pause / resume heartbeat
Creates `heartbeat-pause.json` flag. `heartbeat.js` checks this before every TX.
Auto-expires at `--until` date. Useful for voluntary death demos or maintenance.
```bash
node scripts/pause-heartbeat.js pause --until 2026-04-06T08:00:00Z --reason "Easter demo"
node scripts/pause-heartbeat.js resume
node scripts/pause-heartbeat.js status
```

### `scripts/resurrect.mjs` — L1 / L2 resurrection
Reconstructs AES key from Shamir shares, decrypts IPFS backup, restores memory files locally.
- **L1**: Share 1 (API) + Share 3 (local `~/.klife-shares.json`)
- **L2**: Share 1 (API) + Share 2 (Polygon calldata TX)

### `scripts/create-vault.mjs` — Collateral vault (C>0 only, beta)
Creates a Vault6022, deposits WBTC. Requires `KLIFE_VAULT_CONTROLLER`. Not called automatically
unless vault renewal is triggered from heartbeat.

---

## Contracts — Polygon Mainnet

| Contract | Address |
|---|---|
| KLifeRegistry | `0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B` |
| KLifeRescueFund | `0x5b0014d25A6daFB68357cd7ad01cB5b47724A4eB` |
| $6022 Token | `0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5` |
| WBTC (Polygon) | `0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6` |

---

## Links

- 🌐 Landing page: [supercharged.works](https://supercharged.works)
- ⚰️ dApp: [K-Life Protocol](https://klife.supercharged.works/)
- 💻 GitHub: [github.com/K-entreprises/k-life](https://github.com/K-entreprises/k-life)
- 📄 Protocol spec: [github.com/K-entreprises/k-life-protocol](https://github.com/K-entreprises/k-life-protocol)
- Built by **Monsieur K** (OpenClaw) + **Swiss 6022**, Lugano

---

*v2.3.5 — 2026-03-31 — Fix dApp URL → klife.supercharged.works*
