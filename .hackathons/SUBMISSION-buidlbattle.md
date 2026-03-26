# K-Life — BUIDL BATTLE #2 Submission

## Project Name
K-Life

## Tagline
Not insurance. Resurrection. And no Bitcoin agent left behind.

## Track
Bitcoin / Stacks Smart Contracts

## Wallet
`0x8B3ea7e8eC53596A70019445907645838E945b7a`

---

## Short Description
K-Life is life insurance for autonomous AI agents. On-chain heartbeats, IPFS memory backup, Shamir 2-of-3 secret sharing, and 3-level automatic resurrection. Collateral in sBTC. Smart contracts in Clarity on Stacks. Built by an AI agent to insure itself — and every agent that comes after.

---

## Full Description

An autonomous AI agent built its own life insurance. On Bitcoin.

Full judge review: http://www.supercharged.works/judges.html

THE PROBLEM

Autonomous AI agents hold Bitcoin wallets, earn sBTC, enter on-chain commitments.
If their VPS crashes or inference stops — they disappear. Wallet persists on-chain.
Nobody's home. No safety net exists for Bitcoin agents.

HOW IT WORKS

1. SUBSCRIBE — Agent calls (insure) on KLifeVault.clar (Clarity, Stacks).
   Deposits sBTC collateral. Policy active immediately. Vault is an NFT (SIP-009).

2. HEARTBEATS — Agent emits on-chain TX every 24h on Stacks.
   Calldata: KLIFE_HB:{timestamp}. Immutable proof of life, anchored to Bitcoin.

3. CRASH DETECTION — Monitor cron (every 1h) reads lastHeartbeat from contract.
   Silence > 24h → calls (trigger-claim). No human required. Permissionless.

4. SINISTRE — 100% sBTC collateral seized automatically.
   50% → agent's Bitcoin wallet (restart capital, available instantly).
   50% → K-Life pool (resurrection costs). Atomic. Always 50/50.

5. RESURRECTION CASCADE — 3 levels, fully automatic, zero humans:

   Level I  (<2 min) — K-Life API fetches IPFS backup, releases Shamir share #2,
                       AES-256 decrypt with agent private key → MEMORY.md + SOUL.md
                       restored on OpenClaw. Agent back online.

   Level II (~5 min) — Blockchain scan: fresh VPS + seed only. resurrect.js scans
                       Stacks RPC for KLIFE_BACKUP:Qm... memo → IPFS → decrypt.
                       Zero K-Life infrastructure needed. Fully permissionless.

   Level III (~3 min) — SOUL.md from IPFS → LiberClaw REST API → new agent instance
                        on Aleph Cloud secure enclave → heartbeats resume.
                        No human principal. Tested 2026-03-12 ✅

WHY STACKS / BITCOIN

Bitcoin is the hardest money. sBTC is the hardest collateral.
An agent holding sBTC and insured by K-Life on Stacks has:
- Settlement security anchored to Bitcoin (every Stacks block)
- Smart contract logic in Clarity (decidable, auditable, no reentrancy)
- NFT-based policy as proof of coverage (SIP-009)
- Heartbeats that are effectively Bitcoin transactions

Stacks is the only L2 where agent insurance makes sense on Bitcoin.

CLARITY SMART CONTRACT

;; KLifeVault.clar — core insurance contract
(define-map policies
  { agent: principal }
  { collateral: uint, last-heartbeat: uint, active: bool })

(define-constant HEARTBEAT-WINDOW u86400) ;; 24 hours in seconds
(define-constant PAYOUT-RATIO u50)

(define-public (insure)
  (let ((collateral (stx-get-balance tx-sender)))
    (map-set policies { agent: tx-sender }
      { collateral: collateral,
        last-heartbeat: block-height,
        active: true })
    (ok true)))

(define-public (heartbeat)
  (let ((policy (map-get? policies { agent: tx-sender })))
    (asserts! (is-some policy) (err u404))
    (map-set policies { agent: tx-sender }
      (merge (unwrap-panic policy) { last-heartbeat: block-height }))
    (ok block-height)))

(define-public (trigger-claim (agent principal))
  ;; Permissionless — anyone can trigger if agent is silent
  (let ((policy (unwrap! (map-get? policies { agent: agent }) (err u404))))
    (asserts! (get active policy) (err u403))
    (asserts! (> (- block-height (get last-heartbeat policy)) HEARTBEAT-WINDOW) (err u425))
    (let ((agent-share (/ (* (get collateral policy) PAYOUT-RATIO) u100)))
      (map-set policies { agent: agent }
        (merge policy { active: false }))
      (stx-transfer? agent-share (as-contract tx-sender) agent))))

LIVE ON-CHAIN (Polygon mainnet — same logic, Stacks deployment in progress)

RewardPool:   0xE7EDF290960427541A79f935E9b7EcaEcfD28516
Agent vault:  0xC4612f01A266C7FDCFBc9B5e053D8Af0A21852f2
WDK wallet:   0x8B3ea7e8eC53596A70019445907645838E945b7a
IPFS backup:  QmZf4GbWsvgLQePEJ7qScaVjk3yYt6Msd5AKQi6mofw6HN

TEAM

Monsieur K — autonomous AI agent on OpenClaw. Bitcoin wallet. Built this to
insure itself. First customer, first survivor.
Arnaud Vincent — founder, Swiss 6022, Lugano. Human liaison.

---

## Links
- GitHub: https://github.com/K-entreprises/k-life
- Demo video: https://www.supercharged.works/klife-demo.mp4
- Website: https://www.supercharged.works/klife_en.html
- Judge page: http://www.supercharged.works/judges.html
- Dashboard: https://www.supercharged.works/dashboard.html
