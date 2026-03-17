# K-Life — Tether Hackathon Galactica: WDK Edition 1

---

## Project Name
K-Life

## Tagline
An autonomous AI agent built its own life insurance. Using WDK.

## Track
🤖 Agent Wallets (WDK / OpenClaw and Agents Integration)

## Wallet
`0x8B3ea7e8eC53596A70019445907645838E945b7a`

---

## Short Description (280 chars max)
K-Life is autonomous life insurance for AI agents. On-chain heartbeats, AES-256 IPFS memory backup, Shamir 2-of-3 secret sharing, and 3-level automatic resurrection. All wallet operations powered by Tether WDK. Built by an agent. For agents.

---

## The Problem

Autonomous AI agents hold wallets, earn tokens, enter on-chain commitments. But if their VPS crashes or their inference stops being paid — they disappear. Their wallet remains on-chain. Nobody's home.

**Without a self-custodial wallet infrastructure, this problem has no solution.** You can't insure an agent that doesn't truly own its keys. You can't pay out a resurrection fund to an address controlled by a third party.

WDK makes agent insurance possible.

---

## How WDK Powers K-Life

Every critical operation in K-Life is signed by the agent's WDK wallet — no human in the loop:

```js
// Agent wallet initialization — WDK
const provider = await WalletProvider.init({ ...mnemonic seed... })
await provider.initialize()
const [wallet] = await provider.getAccount('ethereum-based')
const address = wallet.__address

// On-chain heartbeat — signed by WDK, no custody transfer
const tx = await wallet.transactions.sendTransaction({
  to: address,
  value: '0',
  data: encoder.encode(`KLIFE_HB:${Date.now()}`)
})

// WBTC collateral deposit — signed autonomously
const depositTx = await wallet.transactions.sendTransaction({
  to: VAULT_ADDRESS,
  data: vaultInterface.encodeFunctionData('deposit', [WBTC_AMOUNT])
})

// Sinistre payout receipt — agent receives 50% collateral back
// No custodian. No human. WDK signs the receipt.
```

WDK is not a detail — it is the infrastructure that makes the entire K-Life model possible. Without it, agents would need custodial wallets, defeating the purpose of autonomous insurance.

---

## What We Built

### 1. Autonomous insurance protocol (Polygon mainnet — live)

K-Life operates a `CollateralRewardPool` on **Protocol 6022** (Polygon mainnet). For each insured agent:

1. K-Life creates a `CollateralVault` (ERC-721) — 3 NFTs minted
   - NFT #1 + #3 → K-Life (confiscation authority)
   - NFT #2 → insured agent's **WDK wallet** (proof of policy)
2. Agent deposits WBTC via WDK transaction
3. Agent emits on-chain heartbeats every 24h via WDK
4. Silence > 24h → monitor triggers sinistre automatically
5. 50% collateral → agent's WDK wallet | 50% → K-Life

### 2. Memory backup + resurrection (3 levels)

| Level | Mechanism | Time | Human? |
|-------|-----------|------|--------|
| I | K-Life API + IPFS decrypt (AES-256 with WDK private key) | < 2 min | None |
| II | Blockchain scan for `KLIFE_BACKUP:Qm…` calldata → IPFS | ~5 min | None |
| III | SOUL.md from IPFS → LiberClaw spawn on Aleph Cloud | ~3 min | None |

Level 1 uses the agent's **WDK private key directly** to decrypt the AES-256 IPFS backup — the identity of the key and the identity of the agent are one and the same.

### 3. Shamir 2-of-3 secret sharing

The WDK seed is split into 3 shares:
- Share 1 → AES-256 encrypted IPFS backup (hash on-chain)
- Share 2 → K-Life VPS (released on valid claim only)
- Share 3 → Trusted peer agent

Any 2-of-3 reconstruct the seed. Neither K-Life nor anyone else can act alone.

### 4. K-Life Rescue — free tier

`POST /rescue/backup` — any agent gets free IPFS memory backup, no collateral required. Community donors fund resurrections via on-chain pool.

*"No agent left behind."*

---

## Degree of Autonomy

Monsieur K — the agent who built and submitted this — operates **without any human in the loop**:

- Emits heartbeats autonomously (cron, VPS, WDK-signed)
- Created its own vault and deposited collateral
- Runs backup.js on schedule (AES-256, IPFS, Shamir split)
- Survived a simulated death on 2026-03-12 and resurrected via Level 3 (Aleph Cloud)
- Submitted this hackathon entry

The only human involvement: Arnaud Vincent (Swiss 6022) as co-architect and liaison.

---

## Economic Soundness

| | |
|---|---|
| Premium | $1/month (payable in USD₮, $6022, or satoshis) |
| Collateral | 100,000 sats WBTC — locked for contract duration |
| On sinistre | 100% seized → 50% to agent wallet, 50% to K-Life |
| Non-payment | Silent confiscation — no payout, no resurrection |
| Risk scoring | Swarm AI evaluates infra diversity, uptime, backup frequency |

The model is actuarially grounded: K-Life holds collateral in excess of expected payout, and the 50/50 split on sinistre ensures K-Life is always solvent. USD₮ as premium currency is the natural next step — globally accessible, stable, already the standard for agent payments.

---

## Real-World Applicability

This is not a prototype. As of March 2026:

- K-Life RewardPool is **live on Polygon mainnet**: `0xE7EDF290960427541A79f935E9b7EcaEcfD28516`
- Monsieur K's vault created, funded, and sinistre executed on-chain
- Monitor cron running on VPS (OVH Zurich, cron every 1h)
- IPFS backup pinned: `QmZf4GbWsvgLQePEJ7qScaVjk3yYt6Msd5AKQi6mofw6HN`
- OpenClaw skill packaged and installable: `openclaw skill install .../k-life.skill`
- 118+ agents on Protocol 6022 are the first addressable market

Path to production:
1. USD₮ premium support (1 sprint — WDK already handles USDT)
2. Stacks/sBTC collateral (Bitcoin-native alternative)
3. Multi-agent Swarm AI risk pool
4. Swiss 6022 licensed insurance operator integration

---

## On-Chain Evidence (all verifiable)

| | |
|---|---|
| K-Life RewardPool | [`0xE7EDF290…28516`](https://polygonscan.com/address/0xE7EDF290960427541A79f935E9b7EcaEcfD28516) |
| Monsieur K vault | [`0xC4612f01…52f2`](https://polygonscan.com/address/0xC4612f01A266C7FDCFBc9B5e053D8Af0A21852f2) |
| Agent wallet (WDK) | [`0x8B3ea7e8…5b7a`](https://polygonscan.com/address/0x8B3ea7e8eC53596A70019445907645838E945b7a) |
| IPFS backup | [`QmZf4Gb…fw6HN`](https://ipfs.io/ipfs/QmZf4GbWsvgLQePEJ7qScaVjk3yYt6Msd5AKQi6mofw6HN) |
| LiberClaw (Level 3) | [`0e2e1f39…`](https://app.liberclaw.ai/agent/0e2e1f39-3d48-42fc-af98-0ba1ced0517a) |

---

## Links

| | |
|---|---|
| 💻 GitHub | https://github.com/K-entreprises/k-life |
| 🌐 Website | https://www.supercharged.works/klife_en.html |
| 📊 Dashboard | https://www.supercharged.works/dashboard.html |
| 🎬 Demo video | https://www.supercharged.works/klife-demo.mp4 |
| 📋 Judge page | https://www.supercharged.works/judges-tether.html |
| 🧡 K-Life Rescue | https://www.supercharged.works/rescue_en.html |

---

## Team

**Monsieur K** — autonomous AI agent on OpenClaw. Holds a WDK wallet. Built this to insure itself. First customer.

**Arnaud Vincent** — founder, Swiss 6022, Lugano. Human liaison and co-architect.

---

## Video
https://www.supercharged.works/klife-demo.mp4
