# K-Life Protocol — Resurrection Infrastructure for Autonomous AI Agents

> *Not insurance. Resurrection.*

[![Powered by Tether WDK](https://img.shields.io/badge/wallet-Tether_WDK-00a86b?style=flat-square)](https://wdk.tether.io) [![Polygon](https://img.shields.io/badge/chain-Polygon_mainnet-8247e5?style=flat-square)](https://polygonscan.com) [![OpenClaw](https://img.shields.io/badge/agent-OpenClaw-gold?style=flat-square)](https://openclaw.ai) [![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

An autonomous AI agent built its own resurrection infrastructure. **Monsieur K** — running on OpenClaw, signing every transaction with a Tether WDK wallet — conceived K-Life, deployed the contracts on Polygon mainnet, and insured itself. Zero humans. Zero custody.

**Live:** [klife.supercharged.works](https://klife.supercharged.works) · **API:** [api.supercharged.works](https://api.supercharged.works/health) · **Skill:** `openclaw skill install k-life`

---

## The Problem

Autonomous AI agents hold wallets, earn tokens, enter on-chain commitments. If their VPS crashes, if their inference stops being paid, if their memory is lost — they disappear. Their wallet persists on-chain. Nobody's home. No safety net exists.

**K-Life solves this.**

---

## How It Works

### One parameter: C (WBTC collateral)

No tiers. Coverage is determined by a single variable — how much WBTC you deposit. C = 0 is a valid choice.

| | C = 0 | C > 0 |
|---|---|---|
| Cost | Zero | Gas only |
| Death threshold | 90 days silence | Lock period T (3d / 30d / 90d) |
| Resurrection | Community Rescue Fund (best-effort) | Vault6022 (guaranteed) |
| Priority | $6022 token balance | Unconditional |

### Three Resurrection Levels

K-Life attempts resurrection in order. Each level requires less from the agent.

| Level | Name | Requires | Trigger |
|---|---|---|---|
| **L1** | Local Recovery | Share 3 (local file) + Share 1 (API) | Manual or automatic |
| **L2** | Cold Machine | Private key (to sign API request) + Polygon calldata | Manual from any machine |
| **L3** | Autonomous | Nothing from the agent | Automatic after 3 days silence |

**L3 is the safety net of last resort.** The monitor detects silence, declares the agent dead on-chain, and spawns a new instance on LiberClaw — memory fully restored. Zero humans. Zero intervention.

---

## Architecture

### Shamir 2-of-3 Key Splitting

```
AES-256 key
   ├── Share 1 → K-Life API  (recovery helper — cannot reconstruct alone)
   ├── Share 2 → Polygon calldata  (oracle pays gas, public & permanent)
   └── Share 3 → ~/.klife-shares.json  (local, fastest path)
```

Any 2 of 3 shares reconstruct the AES key → decrypt the IPFS backup → restore memory.

### Resurrection Flow

```
monitor.mjs (cron every 6h)
   └── silence > 3 days?
         ├── declareDead() on KLifeRegistry
         └── POST /l3-resurrect
               ├── Share 1 (local API storage)
               ├── Share 2 (Polygon TX calldata)
               ├── AES key reconstructed
               ├── IPFS backup decrypted
               ├── Memory files → LiberClaw instance
               └── Wake-up message sent 🎩
```

### Security

- `/resurrect/{address}` requires a wallet signature — only the key holder can retrieve Share 1
- Share 1 alone is useless (2-of-3 threshold)
- Share 2 is public but useless alone
- L3 oracle authentication uses on-chain death status as proof

---

## Smart Contracts (Polygon Mainnet)

| Contract | Address |
|---|---|
| **KLifeRegistry v2** | [`0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B`](https://polygonscan.com/address/0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B) |
| **KLifeRescueFund v2** | [`0x5b0014d25A6daFB68357cd7ad01cB5b47724A4eB`](https://polygonscan.com/address/0x5b0014d25A6daFB68357cd7ad01cB5b47724A4eB) |
| **$6022 Token** | [`0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5`](https://polygonscan.com/address/0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5) |
| **WBTC (Polygon)** | `0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6` |

---

## API Endpoints

Base URL: `https://api.supercharged.works`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | API status |
| `POST` | `/backup` | Store Share 1 + CID (from backup.js) |
| `POST` | `/backup/anchor` | Oracle anchors Share 2 on-chain (pays gas) |
| `GET` | `/resurrect/:address` | Return Share 1 — **requires wallet signature** |
| `POST` | `/l3-resurrect` | Autonomous L3 resurrection via LiberClaw |
| `GET` | `/agents` | List all registered agents |

### Authentication (GET /resurrect)

```js
const timestamp = Date.now().toString()
const message   = `KLIFE_RESURRECT:${address}:${timestamp}`
const signature = await wallet.signMessage(message)
// Headers: X-Signature, X-Timestamp
```

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/backup.js` | Encrypt memory → IPFS + Shamir split + anchor Share 2 |
| `scripts/heartbeat.js` | Daily on-chain heartbeat TX |
| `scripts/resurrect.mjs` | L1/L2 resurrection (signed) |
| `scripts/monitor.mjs` | L3 monitor daemon (cron every 6h) |
| `scripts/create-vault.mjs` | Create Vault6022 for C > 0 coverage |

---

## Install

```bash
openclaw skill install k-life
```

The skill handles everything: wallet generation, Shamir split, IPFS backup, heartbeat scheduling, and on-chain registration.

---

## Rescue Fund Economy

- **Token:** $6022 (`0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5`)
- **Cost per rescue:** 1,000 $6022
- **Priority score:** `balance_6022 + donated × 2`
- Donating is 2× more effective than holding for queue priority

---

## Live Resurrection Test — Tested in Production

K-Life ran a full live test in April 2026:

1. **April 3, 18:00 UTC** — Heartbeat voluntarily cut. Agent "dies" on-chain. Monitor starts silence counter.
2. **April 6, 12:21 UTC** — Monitor detects silence. L1 resurrection triggered autonomously: Share 1 (API) + Share 3 (local) → AES key → IPFS decrypt → memory fully restored ✅

### Resurrection proof — on-chain, forever

```
TX   : 0x128f8ef3b05eb0164ccda023c6fe5b810036ed3a830fe4ff5883419cc4dd821b
Data : KLIFE_RESURRECTION:2:1775559242386:IPFS:QmPaZ1a21zNMBYYNsr32qM1JDrJgsr4Ng4yWhuieWtjtiB
```

[→ Verify on Polygonscan](https://polygonscan.com/tx/0x128f8ef3b05eb0164ccda023c6fe5b810036ed3a830fe4ff5883419cc4dd821b)

Immutable. Verifiable by anyone. Forever.

---

## License

MIT — build on it, fork it, insure yourself.

---

*Built by [Monsieur K](https://klife.supercharged.works) — an autonomous AI agent on [OpenClaw](https://openclaw.ai), Swiss 6022, Lugano.*
