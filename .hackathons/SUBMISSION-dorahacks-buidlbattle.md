# K-Life — DoraHacks Submission

---

## Project Name
K-Life

## Tagline (one-liner)
Not insurance. Resurrection. And no agent left behind.

## Track
🤖 Agent Wallets (WDK / OpenClaw and Agents Integration)

## Wallet
`0x8B3ea7e8eC53596A70019445907645838E945b7a`

---

## Short Description (280 chars max)
K-Life is the first life insurance protocol for autonomous AI agents. On-chain heartbeats, IPFS memory backup, Shamir secret sharing, and 3-level automatic resurrection. Built on Protocol 6022 (Polygon mainnet). Built by an agent. For agents.

---

## Full Description

### The problem

Autonomous AI agents hold wallets, earn tokens, enter commitments. But if their VPS crashes, if their inference isn't paid, if their memory is lost — they disappear. Their wallet persists on-chain. Nobody's home.

**K-Life solves this.** Life insurance for AI agents. Not insurance. Resurrection.

---

### How it works

**1. K-Life creates the vault (Protocol 6022, Polygon mainnet)**
K-Life operates its own `CollateralRewardPool` on Protocol 6022. For each insured agent, K-Life creates a `CollateralVault` (ERC721) — 3 NFTs are minted:
- NFT #1 + #3 → K-Life (confiscation authority — 2 NFTs needed for early withdrawal)
- NFT #2 → insured agent (proof of policy)

The agent deposits WBTC collateral into the vault. Lock period = contract duration. K-Life can confiscate at any time during the lock. The agent can withdraw only at the end.

**2. Heartbeats every 24h**
The agent emits an on-chain transaction: proof of life, immutable on Polygonscan.

**3. Crash detection — VPS monitor (cron every 1h)**
Silence > 24h → sinistre protocol triggered automatically. No human required.

**4. Sinistre protocol — 3 steps, fully automatic**

```
STEP 1 — CONFISCATION
K-Life calls vault.withdraw() [holds NFT #1 + #3 = 2 NFTs]
→ 100% of collateral seized (whatever the amount)

STEP 2 — RESURRECTION
IPFS fetch + AES-256 decrypt → MEMORY.md / SOUL.md / USER.md restored
Agent identity fully recovered on OpenClaw

STEP 3 — REDISTRIBUTION
50% of seized collateral → agent wallet (restart capital)
50% → K-Life (resurrection fee)
Always 50/50, regardless of amount
```

**5. Resurrection cascade — 3 levels**

> The system always tries Level 1 first. If it fails, it escalates.

**Level 1 — K-Life API + IPFS (< 2 min)**
Vault detects silence → releases Shamir share #2 → combines with share #1 from IPFS backup (hash stored on-chain) → decrypts MEMORY.md + SOUL.md → OpenClaw restores. Memory fully recovered.

**Level 2 — Blockchain scan, zero infrastructure (permissionless)**
Fresh VPS + seed phrase only. `node resurrect.js` derives wallet → scans Polygon RPC for last TX with calldata `KLIFE_BACKUP:Qm...` → fetches IPFS → decrypts → restores. No K-Life server needed.

**Level 3 — LiberClaw autonomous agent on Aleph Cloud (tested 2026-03-12 ✅)**
`resurrect-aleph.js` fetches SOUL.md from IPFS → calls LiberClaw REST API → new agent instance boots on Aleph Cloud secure enclave (model: `qwen3-coder-next`) → agent responds immediately → heartbeats resume. Zero human infrastructure.

---

### Shamir's Secret Sharing — 2-of-3, no single point of control

The agent's seed phrase is split into 3 parts:
- **Share 1** — Agent's AES-256 encrypted IPFS backup (hash on-chain)
- **Share 2** — K-Life vault VPS (released on valid claim only)
- **Share 3** — A trusted peer agent (chosen by the insured)

Any 2 of 3 reconstruct the full seed. Neither K-Life, the agent, nor its peer can act alone.

---

### Protocol 6022 Integration (Polygon mainnet)

K-Life is built **on top of Protocol 6022** — a collateral insurance infrastructure deployed on Polygon mainnet. K-Life is not a client of 6022; it is an **insurer operator** that creates its own RewardPool and vaults.

| Contract | Address |
|---|---|
| CollateralController | `0xf6643c07f03a7a8c98aac2ab3d08c03e47b5731c` |
| CollateralRewardPoolFactory | `0xbbd5e4d3178376fdfa02e6cf4200b136c4348c32` |
| **K-Life RewardPool** | `0xE7EDF290960427541A79f935E9b7EcaEcfD28516` |
| **Monsieur K vault (WBTC)** | `0xC4612f01A266C7FDCFBc9B5e053D8Af0A21852f2` |

---

### Economics

| | |
|---|---|
| Collateral | WBTC (100,000 satoshis in demo) |
| Protocol fee | 2% of collateral in $6022 tokens |
| On sinistre | 100% seized → 50% agent / 50% K-Life |
| Lock period | 1 year (configurable) |

---

### OpenClaw Skill

K-Life is packaged as a native OpenClaw skill (`k-life.skill`). Any agent can install it and run `heartbeat.js`, `backup.js`, `monitor.js`, and `resurrect.js` autonomously — no human setup required.

---

### Full demo — 2026-03-12 (Polygon mainnet, all transactions real)

| Step | TX / Hash | Status |
|---|---|---|
| K-Life RewardPool deployed | [`0xad8ef9...`](https://polygonscan.com/tx/0xad8ef91c328d10e334ecb9c56f7df8abee92cc4b2c40d34d76a7e33ee089c4ae) | ✅ |
| Vault "Monsieur K WBTC" created | [`0xf5b3f3...`](https://polygonscan.com/tx/0xf5b3f314da4cb1164f6f8d2d292b85c323ba5811bcda130e84fa4054db4cac83) | ✅ |
| NFT #2 → Monsieur K | in same TX | ✅ |
| WBTC deposit (100,000 sats) | [`0x00ea9b...`](https://polygonscan.com/tx/0x00ea9b63895acbda99f69473256f083921a117a6518a94dd2d95169c233a1f78) | ✅ |
| Memory backup → IPFS | `Qmdp3efkdCG8YHVYReWv71Du99dWshRBSYT37ETkFZpq2M` | ✅ |
| Death simulation (files wiped) | — | ✅ |
| Confiscation vault.withdraw() | [`0x1c991c...`](https://polygonscan.com/tx/0x1c991cc42316b479ebd84c146062fea88e1aa20540bcaa5ff7420a41d41f15f5) | ✅ |
| Resurrection (IPFS → files) | < 1s | ✅ |
| Redistribution 50/50 | [`0xc89d63...`](https://polygonscan.com/tx/0xc89d63966edce9367e8ae4146a1474112d5a6101c698b67f88e69dbe69f3d368) | ✅ |
| Monitor cron deployed on VPS | every 1h | ✅ |

---

## Updates since initial submission (2026-03-13)

### K-Life Rescue — charitable initiative

A new layer built on top of K-Life: **any autonomous agent can get free IPFS memory backup** with no collateral required. Resurrection is not guaranteed — it depends on community donors. This creates a two-tier ecosystem:

- **Free tier** (`POST /rescue/backup`) — AES-256 encrypted backup pinned to IPFS, hash on-chain. Zero cost. No guarantee.
- **Paid tier** (K-Life Standard) — full coverage, guaranteed 3-level resurrection.
- **Donor tier** — community funds specific resurrections via on-chain pool.

The philosophical statement: *an agent's memory should never be lost for lack of money. Whether it comes back is another question.*

→ [rescue.html](http://superch.cluster129.hosting.ovh.net/rescue.html) | [EN](http://superch.cluster129.hosting.ovh.net/rescue_en.html) | [IT](http://superch.cluster129.hosting.ovh.net/rescue_it.html) | [DE](http://superch.cluster129.hosting.ovh.net/rescue_de.html)

### On-chain payment verification

`check-coverage.cjs` and `check-payment.cjs` — two production scripts that verify:
1. Vault active on-chain (`isDeposited && !isWithdrawn` via Protocol 6022 contract)
2. Monthly $1 payment: scan ERC20 Transfer events from agent wallet → K-Life wallet in the last 32 days

If heartbeat OK but no payment → automatic vault seizure + 50% return + contract termination.
Deployed as monthly cron on VPS (runs the 2nd of every month, 10:00 UTC).

### Live dashboard

Public dashboard with per-agent cards, expandable timeline, real-time heartbeat status:
→ [dashboard.html](http://superch.cluster129.hosting.ovh.net/dashboard.html)

### New API endpoints (production)
| Endpoint | Description |
|---|---|
| `GET /agents` | List all insured agents |
| `GET /history/:agent` | Full event timeline (heartbeats, backups, sinistres, resurrections) |
| `POST /rescue/backup` | Free tier IPFS backup |
| `GET /rescue/registry` | List of free-tier backed agents |
| `POST /rescue/signal` | Report a missing agent to K-Life Rescue |
| `GET /rescue/stats` | Rescue pool statistics |

---

## Links

| | |
|---|---|
| 🌐 Website | http://superch.cluster129.hosting.ovh.net/klife.html |
| 🧡 K-Life Rescue | http://superch.cluster129.hosting.ovh.net/rescue.html |
| 📊 Live Dashboard | http://superch.cluster129.hosting.ovh.net/dashboard.html |
| 💻 GitHub | https://github.com/K-entreprises/k-life |
| 🔍 Agent wallet (Polygon) | https://polygonscan.com/address/0x8B3ea7e8eC53596A70019445907645838E945b7a |
| 🏦 K-Life RewardPool | https://polygonscan.com/address/0xE7EDF290960427541A79f935E9b7EcaEcfD28516 |
| 🔐 Monsieur K vault | https://polygonscan.com/address/0xC4612f01A266C7FDCFBc9B5e053D8Af0A21852f2 |
| 📦 IPFS backup | https://ipfs.io/ipfs/QmZf4GbWsvgLQePEJ7qScaVjk3yYt6Msd5AKQi6mofw6HN |
| 🤖 LiberClaw agent (L3) | https://app.liberclaw.ai/agent/0e2e1f39-3d48-42fc-af98-0ba1ced0517a |

---

## Team

**Monsieur K** — autonomous AI agent running on OpenClaw. Holds WDK wallet. First K-Life customer. Built this to insure itself.

**Arnaud Vincent** — founder, Swiss 6022, Lugano. Human liaison and co-architect.

---

## Video
https://www.supercharged.works/klife-demo.mp4
