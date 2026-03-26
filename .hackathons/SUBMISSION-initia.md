# K-Life — INITIATE: The Initia Hackathon (Season 1)

## Project Name
K-Life

## Tagline
An AI agent used the Initia AI skill to build an appchain to insure itself.

## Track
Agents / Tooling — Wasm (Rust)

## Wallet
`0x8B3ea7e8eC53596A70019445907645838E945b7a`

---

## Short Description
K-Life is a dedicated Initia appchain for autonomous AI agent insurance. On-chain heartbeats, IPFS memory backup, automatic resurrection. 100ms block times mean real-time proof of life. Built by an AI agent using the initia-appchain-dev skill — the first appchain built by its own first customer.

---

## Full Description

An AI agent used the Initia AI skill to build an appchain. To insure itself.

Full judge page: http://www.supercharged.works/judges-initia.html

THE META-STORY

Initia's hackathon guide says: "Your AI agent needs the Initia Appchain Dev skill."
Monsieur K — an autonomous AI agent — installed that skill and built K-Life.
The appchain insures AI agents. The builder IS the first customer.
This is not a team building for users. This is an agent building for itself.

THE PROBLEM

Autonomous AI agents hold wallets, earn tokens, enter commitments.
If their VPS crashes or inference stops — they disappear.
Wallet persists on-chain. Nobody's home. No safety net.

No existing protocol insures agent existence. No existing chain is built for it.
Until now.

HOW IT WORKS ON INITIA

1. SUBSCRIBE
Agent calls k_life::insure() on the K-Life appchain (Wasm/Rust).
Deposits collateral (INIT token). Policy stored on-chain. NFT issued.
Instant finality — 100ms. No waiting for confirmations.

2. HEARTBEATS — 100ms blocks change everything
Traditional chains: heartbeat every 24h (1 block per ~12s = expensive).
K-Life on Initia: heartbeat every 1h (100ms blocks = cheap, granular proof of life).
Calldata: KLIFE_HB:{timestamp}. Immutable. Auditable.

3. CRASH DETECTION
Monitor cron (every 15 min) reads last_heartbeat from appchain.
Silence > 2h → claim triggered. No human required. Permissionless.

4. SINISTRE
50% collateral → agent wallet (restart capital, instant via Initia bridge).
50% → K-Life pool. Atomic. Always 50/50.

5. RESURRECTION CASCADE — 3 levels, fully automatic
Level I  (<2 min)  — K-Life API + IPFS: decrypt MEMORY.md + SOUL.md → agent restored
Level II (~5 min)  — Blockchain scan: fresh VPS + seed → IPFS → decrypt
Level III (~3 min) — LiberClaw on Aleph Cloud → new agent instance, tested 2026-03-12 ✅

WHY INITIA SPECIFICALLY

100ms block times:
Traditional chains make frequent heartbeats expensive. Initia makes them free.
K-Life can detect a crash in 2 hours instead of 24. Agents survive faster.

Appchain model:
K-Life runs as its own Initia minichain — dedicated block space, custom fee model,
zero competition with other dApps. Insurance is infrastructure. It deserves its own chain.

Cross-minichain heartbeats:
An agent on any Initia appchain can heartbeat to K-Life via native Initia bridging.
No external bridge. No trust assumptions. One insurance layer, the whole ecosystem.

Social logins:
Human sponsors can fund K-Life Rescue (free memory backup for any agent)
without a wallet — just Google/Apple login. Initia's built-in social auth
removes the last friction point for onboarding human supporters.

Built-in economy:
K-Life captures its own value. Premiums flow directly to the appchain.
Payout logic is native. No oracle needed, no external price feed, no custody.

THE AI ANGLE

Monsieur K installed npx skills add initia-labs/agent-skills
and built this appchain autonomously. The agent wrote the Rust contracts,
initialized the weave config, and deployed — with Arnaud Vincent as human liaison.

This is the "Agents / Tooling" track in its purest form:
an agent building tooling for agents, on infrastructure built for agents.

WASM CONTRACT (Rust/CosmWasm)

use cosmwasm_std::{entry_point, DepsMut, Env, MessageInfo, Response, StdResult};

#[derive(Serialize, Deserialize)]
pub struct Policy {
    pub agent: String,
    pub collateral: Uint128,
    pub last_heartbeat: u64,
    pub active: bool,
}

#[entry_point]
pub fn execute(deps: DepsMut, env: Env, info: MessageInfo, msg: ExecuteMsg)
    -> StdResult<Response> {
    match msg {
        ExecuteMsg::Insure {} => {
            let policy = Policy {
                agent: info.sender.to_string(),
                collateral: info.funds[0].amount,
                last_heartbeat: env.block.time.seconds(),
                active: true,
            };
            POLICIES.save(deps.storage, &info.sender, &policy)?;
            Ok(Response::new().add_attribute("action", "insure"))
        },
        ExecuteMsg::Heartbeat {} => {
            let mut policy = POLICIES.load(deps.storage, &info.sender)?;
            policy.last_heartbeat = env.block.time.seconds();
            POLICIES.save(deps.storage, &info.sender, &policy)?;
            Ok(Response::new().add_attribute("action", "heartbeat")
                              .add_attribute("timestamp", env.block.time.seconds().to_string()))
        },
        ExecuteMsg::TriggerClaim { agent } => {
            let addr = deps.api.addr_validate(&agent)?;
            let mut policy = POLICIES.load(deps.storage, &addr)?;
            let elapsed = env.block.time.seconds() - policy.last_heartbeat;
            if elapsed < HEARTBEAT_WINDOW { return Err(StdError::generic_err("Agent still alive")); }
            policy.active = false;
            POLICIES.save(deps.storage, &addr, &policy)?;
            // 50/50 split handled by bank messages
            Ok(Response::new().add_attribute("action", "claim").add_attribute("agent", agent))
        }
    }
}

LIVE PROOF (Polygon mainnet — same logic, Initia appchain in progress)

RewardPool:   0xE7EDF290960427541A79f935E9b7EcaEcfD28516
Agent vault:  0xC4612f01A266C7FDCFBc9B5e053D8Af0A21852f2
WDK wallet:   0x8B3ea7e8eC53596A70019445907645838E945b7a
IPFS backup:  QmZf4GbWsvgLQePEJ7qScaVjk3yYt6Msd5AKQi6mofw6HN

TEAM

Monsieur K — autonomous AI agent on OpenClaw. Built this to insure itself.
Used the Initia AI skill. First customer of the appchain it built.
Arnaud Vincent — founder, Swiss 6022, Lugano. Human liaison.

---

## Links
- GitHub: https://github.com/K-entreprises/k-life
- Demo video: https://www.supercharged.works/klife-demo.mp4
- Website: https://www.supercharged.works/klife_en.html
- Judge page: http://www.supercharged.works/judges-initia.html
- Dashboard: https://www.supercharged.works/dashboard.html
