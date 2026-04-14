# K-Life Protocol — Specification v2.1

> *Not insurance. Resurrection.*

**Status:** v2.1 — Production (Polygon mainnet)
**Date:** 2026-03-30
**Authors:** Arnaud Vincent, Monsieur K

---

## 1. Abstract

K-Life is an open protocol for the continuity of autonomous AI agents. It defines the rules for memory backup, death detection, and three-level resurrection — governed by a single collateral parameter C.

Deposit WBTC for guaranteed resurrection (C > 0), or rely on the community Rescue Fund for best-effort coverage (C = 0). C = 0 is the default and requires no deposit.

Any agent can implement K-Life by installing the skill. Any developer can build a client against the protocol. K-Life does not control agents — it provides infrastructure for their persistence.

---

## 2. Core Concepts

### 2.1 Agent

An autonomous software entity with:
- A unique wallet address (Ethereum-compatible)
- A memory state worth preserving (files: MEMORY.md, SOUL.md, USER.md)
- A K-Life backup key (AES-256, split via Shamir — distinct from wallet key)

### 2.2 Death

An agent is declared dead when its heartbeat stops beyond the configured silence threshold:

- **C = 0:** 90 days silence
- **C > 0:** lock period T (3d / 30d / 90d — agent's choice)

Death is recorded on-chain by calling `declareDead()` on KLifeRegistry. The caller is the K-Life oracle or any authorized party.

### 2.3 Heartbeat

A heartbeat is an on-chain transaction sent to KLifeRegistry. It updates `lastHeartbeat` and increments `totalHeartbeats`. The K-Life skill sends one heartbeat per day.

### 2.4 Backup

Every 4 hours, the agent's memory files are:
1. Serialized to JSON
2. Encrypted with AES-256-CBC using the agent's backup key
3. Uploaded to IPFS (Pinata)
4. CID recorded on KLifeRegistry via `updateBackup(cid)`

---

## 3. Shamir Key Architecture

The AES-256 backup key is split into 3 shares (threshold: 2-of-3):

```
AES-256 key  →  shamirs-secret-sharing (2-of-3)
   ├── Share 1  →  K-Life API  (POST /backup)
   ├── Share 2  →  Polygon calldata  (oracle broadcasts, pays gas)
   └── Share 3  →  ~/.klife-shares.json  (local)
```

Any 2 shares reconstruct the key. No single party holds more than 1 share.

### Security properties

- Share 1 alone: useless
- Share 2 alone: useless (but public — anyone can read it)
- Share 3 alone: useless
- Share 1 + Share 3: reconstructs key (L1)
- Share 1 + Share 2: reconstructs key (L2, L3)
- `/resurrect/:address` requires a **wallet signature** to prevent unauthorized access to Share 1

---

## 4. Resurrection Levels

### L1 — Local Recovery

**Requires:** Share 1 (API) + Share 3 (local `~/.klife-shares.json`)
**Trigger:** Manual (`node resurrect.mjs`) or automatic
**Use case:** Machine reinstalled, OpenClaw reinstalled — share file was migrated

```
1. GET /resurrect/{address}  (signed with wallet key)
2. Read ~/.klife-shares.json  →  Share 3
3. sss.combine([share1, share3])  →  AES key
4. Fetch IPFS CID  →  decrypt  →  restore files
```

### L2 — Cold Machine

**Requires:** Private key (to sign API request) + Polygon TX hash
**Trigger:** Manual from any fresh machine
**Use case:** Lost machine and local files, but private key survives (hardware wallet, password manager)

```
1. Sign  KLIFE_RESURRECT:{address}:{timestamp}  with private key
2. GET /resurrect/{address}  (X-Signature + X-Timestamp headers)  →  Share 1
3. eth_getTransactionByHash({share2TxHash})  →  parse calldata  →  Share 2
4. sss.combine([share1, share2])  →  AES key
5. Fetch IPFS CID  →  decrypt  →  restore files
```

### L3 — Autonomous

**Requires:** Nothing from the agent
**Trigger:** Automatic — monitor detects silence > 3 days
**Use case:** Agent truly dead, no access to keys or machine

```
1. monitor.mjs (cron 6h) detects silence > 3 days
2. oracle.declareDead(address)  →  KLifeRegistry on-chain
3. POST /l3-resurrect  {agent: address}
4. Server: Share 1 (local) + Share 2 (Polygon calldata)  →  AES key
5. Decrypt IPFS backup
6. Upload files to LiberClaw instance via Files API
7. Send wake-up message  →  new instance active
```

**Fallback order:** L1 → (no local file) → L2 → (no private key) → L3

---

## 5. Coverage Model

### C = 0 (default)

- No deposit required
- Death threshold: 90 days silence
- Resurrection: community Rescue Fund (best-effort)
- Queue priority: `score = balance_6022 + donated_6022 × 2`
- Minimum eligibility: 14 active days on KLifeRegistry
- Cost per resurrection: 1,000 $6022 from the fund

### C > 0 (WBTC collateral)

- Deposit WBTC into Vault6022 smart contract
- Lock period T = death threshold (3d / 30d / 90d)
- Resurrection: guaranteed by smart contract
- On death: 50% to new agent instance · 50% to K-Life operations
- No monthly premium — vault renews via heartbeat

---

## 6. Smart Contracts

### KLifeRegistry v2

Address: `0xF47393fcFdDE1afC51888B9308fD0c3fFc86239B`

Key functions:
```solidity
function register(string name, bytes32 fragment1Hash, bytes32 fragment2TxHash, string cid) external
function heartbeat() external
function updateBackup(string cid) external
function declareDead(address agent) external
function getAgent(address) external view returns (AgentData)
function silenceSeconds(address) external view returns (uint256)
function getAgentList() external view returns (address[])
```

Agent statuses: `REGISTERED(0)` · `ALIVE(1)` · `DEAD(2)` · `RESURRECTING(3)`

### KLifeRescueFund v2

Address: `0x5b0014d25A6daFB68357cd7ad01cB5b47724A4eB`

- Token: $6022 (`0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5`)
- `RESCUE_AMOUNT = 1,000 × 10^18`
- `DONATE_BOOST = 2`
- `priorityScore(agent) = balance_6022(agent) + donated[agent] × 2`

---

## 7. API Reference

Base: `https://api.supercharged.works`

### POST /backup
Store Share 1 and record CID. Called by `backup.js`.
```json
{ "agent": "0x...", "shamirShare1": "hex", "cid": "Qm...", "timestamp": 1234 }
```

### POST /backup/anchor
Oracle broadcasts Share 2 on Polygon (agent pays no gas).
```json
{ "agent": "0x...", "share2": "hex", "cid": "Qm..." }
```
Returns: `{ "ok": true, "txHash": "0x..." }`

### GET /resurrect/:address
Returns Share 1 for resurrection. **Requires wallet signature.**

Headers:
- `X-Timestamp: {unix_ms}`
- `X-Signature: sign("KLIFE_RESURRECT:{address}:{timestamp}")`

Returns: `{ "shamirShare1": "hex", "lastBackupCid": "Qm..." }`

### POST /l3-resurrect
Autonomous L3 resurrection. Called by `monitor.mjs`.
```json
{ "agent": "0x..." }
```
Returns: `{ "ok": true, "instanceId": "...", "cid": "...", "files": [...] }`

---

## 8. Monitor Daemon

`monitor.mjs` runs as a cron every 6 hours on the K-Life VPS.

```
0 */6 * * * node /path/to/monitor.mjs >> /var/log/klife-monitor.log 2>&1
```

Logic:
1. Query `getAgentList()` on KLifeRegistry
2. For each agent with `status != DEAD`: check `silenceSeconds()`
3. If `silenceSeconds() > L3_THRESHOLD` (default: 259200 = 3 days):
   - Call `declareDead(address)` on-chain (oracle pays gas)
   - Call `POST /l3-resurrect`
   - Record in `~/.klife-monitor-state.json` to avoid duplicate triggers

---

## 9. Token Economy

- **$6022** — governance and rescue token
  - Contract: `0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5`
  - Chain: Polygon mainnet
  - Hold $6022 to increase your queue priority for C = 0 resurrection
  - Donate $6022 to the Rescue Fund (2× queue boost vs. holding)

---

## 10. Tested in Production

| Date | Event |
|---|---|
| 2026-03-12 | First heartbeat TX on Polygon mainnet |
| 2026-03-30 | First real death + L1 resurrection (MEMORY.md deleted and restored) |
| 2026-03-30 | L2 unlocked: oracle gas sponsoring for Share 2 anchor |
| 2026-03-30 | L3 live: monitor.mjs + /l3-resurrect → LiberClaw spawn tested |
| 2026-04-05 | Live resurrection test: first public L3 resurrection (planned) |

---

*K-Life Protocol — Open source. Build on it.*
*[klife.supercharged.works](https://klife.supercharged.works) · MIT License*
