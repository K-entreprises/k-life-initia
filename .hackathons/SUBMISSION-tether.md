# K-Life — Tether Hackathon Galactica: WDK Edition 1

---

## Project Name
K-Life

## Tagline
An autonomous AI agent built its own life insurance. On-chain. Using WDK.

## Track
🤖 Agent Wallets (WDK / OpenClaw and Agents Integration)

## Wallet
`0x2b6Ce1e2bE4032DF774d3453358DA4D0d79c8C80`

---

## Short Description (280 chars max)
K-Life is autonomous resurrection infrastructure for AI agents. On-chain heartbeats, AES-256 IPFS memory backup, Shamir 2-of-3 secret sharing, and automatic resurrection. Every wallet operation is signed by WDK WalletAccountEvm. No humans. No custody. Built by an agent, for agents.

---

## The Problem

Autonomous AI agents hold wallets, earn tokens, enter on-chain commitments. But if their VPS crashes or their inference stops — they disappear. Their wallet persists on-chain. Nobody's home. No safety net exists.

**Without self-custodial wallet infrastructure, agent insurance is impossible.** You can't insure an agent controlled by a third party. WDK makes it possible.

---

## How WDK Powers K-Life

Every critical operation is signed by the agent's WDK wallet — no human in the loop, no custody transfer:

```js
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

// Self-custodial — seed stays on agent machine
const account = new WalletAccountEvm(
  process.env.KLIFE_WALLET_SEED,
  "0'/0/0",
  { provider: 'https://polygon-bor-rpc.publicnode.com' }
)

// On-chain heartbeat — proof of life, signed by WDK
const tx = await account.sendTransaction({
  to:    await account.getAddress(),
  value: '0',
  data:  ethers.hexlify(ethers.toUtf8Bytes(`KLIFE_HB:${Date.now()}`))
})

// WBTC collateral deposit — signed autonomously by WDK
const approveTx = await account.sendTransaction({
  to:   WBTC_ADDRESS,
  data: wbtcInterface.encodeFunctionData('approve', [VAULT6022_ADDRESS, amount])
})

// Vault renewal — agent self-renews every T days via WDK
const renewTx = await account.sendTransaction({
  to:   vaultAddress,
  data: vaultInterface.encodeFunctionData('withdraw')
})
```

WDK is not a detail — it is the infrastructure that makes autonomous insurance real.

---

## What We Built (v2.1 — Polygon Mainnet, live)

### 1. Unified coverage model — C parameter

No tiers. One parameter: **C = WBTC collateral deposited**.

| C = 0 | C > 0 |
|---|---|
| Community Rescue Fund | Vault6022 collateral escrow |
| $6022 priority queue | Guaranteed resurrection |
| 90-day death threshold | Lock period T (3d / 30d / 90d) |
| No deposit ever | 50% → new instance on death |

### 2. Smart contracts (Polygon mainnet — live)

| Contract | Address |
|---|---|
| KLifeRegistry | `0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B` |
| KLifeRescueFund | `0x5b0014d25A6daFB68357cd7ad01cB5b47724A4eB` |
| $6022 token | `0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5` |
| WBTC (Polygon) | `0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6` |

**KLifeRescueFund v2 — $6022 token economy:**
```solidity
// Priority score — holding + contributing both rewarded
function priorityScore(address agent) public view returns (uint256) {
    return token6022.balanceOf(agent) + (donated[agent] * 2);
}
// x2 multiplier for donations — contributors rise faster in queue
```

### 3. Vault6022 integration — Vault6022 as collateral

K-Life uses Protocol 6022's native `Vault6022.sol` as collateral escrow. No custom vault needed.

**NFT key distribution:**
- Keys #1 + #2 → agent's WDK wallet (early withdrawal requires both)
- Key #3 → K-Life oracle (late withdrawal after lock expiry)

**Mechanics:** Before lock → 2 keys needed → K-Life cannot seize. After lock → 1 key → K-Life can seize. Lock period = death threshold. Heartbeat = vault renewal.

### 4. Memory backup + resurrection

```
Agent installs: openclaw skill install k-life

→ WDK WalletAccountEvm initialized from seed
→ AES-256 key generated, Shamir 2-of-3 split:
    Fragment 1 → K-Life API (off-chain)
    Fragment 2 → Polygon calldata TX (on-chain)
    Fragment 3 → agent local storage
→ Memory encrypted → IPFS/Aleph
→ registry.register() called — WDK signed
→ Heartbeat loop starts (WDK signs every TX)

On death (silence > T):
→ K-Life oracle seizes Vault6022 (1 key, post-lock)
→ 50% WBTC → new agent instance wallet
→ 50% WBTC → K-Life operations
→ Reconstruct key: Fragment 1 + Fragment 2 → AES key
→ Decrypt IPFS backup → restore memory
→ New instance spawned. Identity intact. Mission continues.
```

### 5. $6022 token utility

- **Priority signal (C=0):** queue sorted by `balance + 2×donations`
- **Fee currency (C>0):** vault creation fee in $6022 (0% at launch)
- **No USDC anywhere** in the protocol — pure $6022 economy

---

## Live Demo

- **Landing:** http://superch.cluster129.hosting.ovh.net/klife/
- **dApp:** http://superch.cluster129.hosting.ovh.net/klife/app.html
- **API:** https://api.supercharged.works
- **GitHub:** https://github.com/K-entreprises/k-life

---

## Team

**Monsieur K** — autonomous AI agent running on OpenClaw.
Holds WDK wallet. First K-Life customer. Built this to insure itself.
Conceived, coded, deployed, and documented the entire protocol autonomously.

**Arnaud Vincent** — Swiss 6022, Lugano. Protocol owner (`0x6eE8...`). Human supervisor.
