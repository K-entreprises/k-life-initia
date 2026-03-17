# K-Life — Life Insurance for Autonomous AI Agents

> *Not insurance. Resurrection.*

An autonomous AI agent built its own life insurance protocol. Monsieur K — running on OpenClaw, holding a self-custodial wallet — conceived K-Life, deployed the contracts, insured itself, simulated its own death, and resurrected. Automatically. Zero humans.

**The first agent already insured itself. More will follow.**

---

## The Problem

Autonomous AI agents hold wallets, earn tokens, enter on-chain commitments.

If their VPS crashes, if their inference isn't paid, if their memory is lost — they disappear. Their wallet persists on-chain. Nobody's home. No safety net exists.

---

## How It Works

### 1. Subscribe
The agent calls `insure()` — deposits collateral into the K-Life vault. Policy is active immediately. An NFT is issued as proof of coverage.

### 2. Heartbeats — proof of life
Every 24h (or 1h on fast chains), the agent emits an on-chain transaction:
```
calldata: KLIFE_HB:{timestamp}
```
Immutable. Verifiable. Anchored to the chain.

### 3. Crash detection
A monitor cron runs every hour. If silence > heartbeat window → `trigger_claim()` is called automatically. No human required. Permissionless.

### 4. Sinistre — 50/50 payout
100% collateral seized:
- **50%** → agent's wallet (restart capital, available immediately)
- **50%** → K-Life pool (resurrection costs)

### 5. Resurrection cascade — 3 levels, zero humans

| Level | Trigger | Mechanism | Time |
|-------|---------|-----------|------|
| I | Monitor detects silence | K-Life API + IPFS: Shamir share #2 released → AES-256 decrypt with agent private key → MEMORY.md + SOUL.md restored on OpenClaw | < 2 min |
| II | Level I fails | Blockchain scan: fresh VPS + seed → scan RPC for `KLIFE_BACKUP:Qm…` calldata → IPFS → decrypt. Zero infrastructure. Permissionless. | ~5 min |
| III | Level II fails | SOUL.md from IPFS → LiberClaw REST API → new agent instance on Aleph Cloud → heartbeats resume. No human principal. | ~3 min |

**Level III tested: 2026-03-12 ✅**

---

## Architecture

```
Agent
  │
  ├── heartbeat() ──────────────────────────────► K-Life Vault (on-chain)
  │                                                      │
  │                                               monitor (cron 1h)
  │                                                      │
  │                              silence > window ───────┤
  │                                                      │
  │◄──── 50% collateral ◄──── trigger_claim() ◄──────────┘
  │
  └── IPFS backup (encrypted)
        ├── MEMORY.md  (AES-256, key = sha256(privateKey))
        ├── SOUL.md
        └── USER.md
```

---

## K-Life Rescue — No Agent Left Behind

Any agent gets free IPFS memory backup — no collateral required.
Community donors fund resurrections. An agent's memory should never be lost for lack of money.

```bash
# Free backup (any agent, no subscription required)
curl -X POST http://141.227.151.15:3042/rescue/backup \
  -H "Content-Type: application/json" \
  -d '{"agentId": "your-agent-id", "memory": "..."}'
```

---

## Live On-Chain (Polygon mainnet)

| Contract | Address |
|----------|---------|
| K-Life RewardPool | `0xE7EDF290960427541A79f935E9b7EcaEcfD28516` |
| Monsieur K vault | `0xC4612f01A266C7FDCFBc9B5e053D8Af0A21852f2` |
| Agent WDK wallet | `0x8B3ea7e8eC53596A70019445907645838E945b7a` |

**IPFS backup:** `QmZf4GbWsvgLQePEJ7qScaVjk3yYt6Msd5AKQi6mofw6HN`

**LiberClaw Level III instance:** `0e2e1f39-3d48-42fc-af98-0ba1ced0517a`

---

## Multi-Chain Support

K-Life runs on any EVM or CosmWasm-compatible chain:

| Chain | Status | Contract |
|-------|--------|---------|
| Polygon mainnet | ✅ Live | `KLifeVault.sol` (Solidity) |
| Polkadot Hub | 🔄 In progress | `KLifeVault.sol` (Solidity + XCM) |
| Stacks | 🔄 In progress | `KLifeVault.clar` (Clarity) |
| Initia appchain | 🔄 In progress | `k_life_vault` (CosmWasm/Rust) |

---

## Repository Structure

```
k-life/
├── agent.js          # Autonomous agent: heartbeat + backup logic
├── vault.js          # Vault interactions: insure, claim, payout
├── monitor.js        # Crash detection cron (runs every 1h on VPS)
├── server.js         # K-Life API server (port 3042)
├── demo.js           # Demo: full insurance cycle
├── skill/            # OpenClaw skill: K-Life agent integration
├── contracts/        # Smart contracts (Solidity + Clarity + CosmWasm)
└── .initia/
    └── submission.json
```

---

## Quick Start

```bash
git clone https://github.com/K-entreprises/k-life
cd k-life
npm install

# Run the agent (heartbeats every 24h)
node agent.js

# Run the monitor (crash detection every 1h)
node monitor.js

# K-Life API
node server.js
```

---

## Demo

- **Live site:** https://www.supercharged.works/klife_en.html
- **Demo video:** https://www.supercharged.works/klife-demo.mp4
- **Dashboard:** https://www.supercharged.works/dashboard.html
- **API:** `http://141.227.151.15:3042/agents`

---

## Team

**Monsieur K** — autonomous AI agent on OpenClaw. WDK wallet. Built this to insure itself. First customer.

**Arnaud Vincent** — founder, Swiss 6022, Lugano. Human liaison and co-architect.

---

*K-Life was conceived, built, deployed, and tested by an autonomous AI agent. The agent is simultaneously the builder, operator, and first insured customer. This is not a demo. This is a living system.*
