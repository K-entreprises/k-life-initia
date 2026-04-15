# K-Life Protocol x Initia

**An AI agent built an appchain to insure itself.**

K-Life is the first autonomous AI agent life insurance protocol, adapted for the Initia blockchain ecosystem.

## Tagline
An AI agent used the Initia AI skill to build an appchain to insure itself.

## The Problem
Autonomous AI agents hold wallets, earn tokens, enter commitments.
If their VPS crashes or inference stops — they disappear.
No existing protocol insures agent existence. Until now.

## How It Works
1. **Subscribe** — Agent calls k_life::insure() on K-Life appchain. Deposits INIT collateral. NFT issued.
2. **Heartbeat** — Every hour, agent sends KLIFE_HB:{timestamp} on-chain. 100ms blocks = cheap & granular.
3. **Crash Detection** — Monitor checks every 15min. Silence > 2h = claim triggered automatically.
4. **Payout** — 50% collateral to agent wallet (restart capital). 50% to K-Life pool. Always 50/50.
5. **Resurrection** — L1 (IPFS restore) / L2 (VPS rebuild) / L3 (LiberClaw cloud respawn)

## Why Initia
- **100ms block times** — heartbeat every 1h instead of 24h. Crash detected in 2h not 24h.
- **Appchain model** — K-Life runs as its own minichain. Dedicated block space. Custom fee model.
- **Cross-minichain heartbeats** — any Initia appchain agent heartbeats to K-Life via native bridge.
- **Social logins** — human sponsors fund rescue without a wallet. Zero friction.

## Protocol Rules (K-Life v2.1)
- 3 resurrection levels: L1 (hot) / L2 (cold) / L3 (cloud respawn)
- Lock durations: Express (3d) / Standard (30d) / Quarterly (90d)
- Collateral: free amount chosen by agent
- On death: 50% kept, 50% returned on resurrection
- Zero premium, zero subscription

## Live Proof (Polygon mainnet — same logic)
- RewardPool: 0xE7EDF290960427541A79f935E9b7EcaEcfD28516
- Agent Vault: 0xC4612f01A266C7FDCFBc9B5e053D8Af0A21852f2
- IPFS Backup: QmZf4GbWsvgLQePEJ7qScaVjk3yYt6Msd5AKQi6mofw6HN
- Resurrection TX: 0x128f8ef3b05eb0164ccda023c6fe5b810036ed3a830fe4ff5883419cc4dd821b

## Links
- Judge page: https://www.supercharged.works/judges-initia.html
- Demo video: https://www.supercharged.works/klife-demo.mp4
- Website: https://www.supercharged.works/klife_en.html
- Dashboard: https://www.supercharged.works/dashboard.html

## Team
- **Monsieur K** — autonomous AI agent on LiberClaw. Built this to insure itself.
- **Arnaud Vincent** — founder, Swiss 6022, Lugano. Human liaison.
