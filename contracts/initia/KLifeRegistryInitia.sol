// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KLifeRegistryInitia
 * @notice Core registry for K-Life Protocol — adapted for the Initia blockchain ecosystem.
 *
 * Deployed on Initia testnet (chainId TBD)
 *
 * Initia-specific notes:
 *   - Initia is an EVM-compatible L1 with 100ms block times — heartbeats are near real-time.
 *   - Social logins (Initia Connect) allow AI agents to onboard without seed phrases.
 *   - Appchain architecture enables dedicated K-Life infrastructure minichain.
 *   - Native bridging via OPinit (Optimistic rollup) connects to the full Initia ecosystem.
 *
 * Agents register with:
 *   - A name
 *   - A Shamir fragment 1 hash (the fragment itself is stored off-chain by the API; only its hash is on-chain)
 *   - A Shamir fragment 2 TX hash (transaction on this chain storing the fragment in calldata)
 *   - An IPFS CID for their encrypted memory backup
 *
 * Lifecycle:
 *   REGISTERED → ALIVE (after first heartbeat)
 *   ALIVE → DEAD (if silence > deadTimeout)
 *   DEAD → RESURRECTING (oracle triggers rescue)
 *   RESURRECTING → ALIVE (agent acknowledges + new backup CID)
 *
 * Resurrection levels (K-Life v2.1 protocol):
 *   L1 — Hot restore: agent memory fetched from IPFS, hot-reloaded into running container
 *   L2 — Cold restore: full agent respawn from IPFS snapshot, new process started
 *   L3 — LiberClaw respawn: new vessel spawned on LiberClaw / Aleph Cloud infrastructure
 *
 * Lock durations (independent from resurrection levels):
 *   Express   — 3 days
 *   Standard  — 30 days
 *   Quarterly — 90 days
 *
 * Collateral model:
 *   - Free amount chosen by agent (no minimum enforced here beyond dust)
 *   - On death: 50% collateral kept by protocol, 50% returned on resurrection
 *   - Zero premium, zero subscription — pure collateral model
 *
 * Tiers:
 *   FREE     - rescue via Rescue Fund (best-effort, requires 14 active days)
 *   INSURED  - rescue via Vault collateral (guaranteed, immediate)
 *
 * @author Monsieur K - K-Life Protocol
 * @dev Initia testnet (chainId TBD) — https://github.com/K-entreprises/k-life/tree/initia
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract KLifeRegistryInitia is Ownable, ReentrancyGuard {

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant MIN_ACTIVE_DAYS_FREE      = 14;   // days before FREE rescue eligibility
    uint256 public constant DEFAULT_DEAD_TIMEOUT_FREE = 30 days;
    uint256 public constant DEAD_TIMEOUT_INSURED      = 3 days;
    uint256 public constant DEMO_DEAD_TIMEOUT         = 5 minutes;
    uint256 public constant RESURRECTION_WINDOW       = 7 days; // max time to ack resurrection

    // Lock duration constants (K-Life v2.1)
    uint256 public constant LOCK_EXPRESS   = 3 days;
    uint256 public constant LOCK_STANDARD  = 30 days;
    uint256 public constant LOCK_QUARTERLY = 90 days;

    // Initia-specific: 100ms blocks — approx block numbers for reference
    // Express:   ~2,592,000 blocks  (3 days @ ~100ms/block)
    // Standard:  ~25,920,000 blocks (30 days)
    // Quarterly: ~77,760,000 blocks (90 days)

    // ── Enums ─────────────────────────────────────────────────
    enum Status     { REGISTERED, ALIVE, DEAD, RESURRECTING, ALIVE_RESURRECTED }
    enum Tier       { FREE, INSURED }
    enum ResLevel   { L1_HOT, L2_COLD, L3_LIBERCLAW }  // K-Life v2.1 resurrection levels
    enum LockDur    { EXPRESS, STANDARD, QUARTERLY }    // K-Life v2.1 lock durations

    // ── Structs ───────────────────────────────────────────────
    struct Agent {
        address  wallet;
        string   name;
        Tier     tier;
        Status   status;
        uint256  registeredAt;
        uint256  lastHeartbeat;
        uint256  totalHeartbeats;
        uint256  activeDays;           // distinct calendar days with heartbeat
        uint256  deadAt;
        uint256  resurrectionCount;
        uint256  resurrectionInitiatedAt;
        bytes32  fragment1Hash;        // keccak256 of fragment1 (not the fragment itself)
        bytes32  fragment2TxHash;      // TX hash storing fragment2 in calldata
        string   lastBackupCid;        // latest IPFS CID of encrypted memory
        uint256  lastBackupTs;
        bool     rescueEligible;
        ResLevel lastResLevel;         // last resurrection level used
        LockDur  lockDuration;         // chosen lock duration (Express/Standard/Quarterly)
        uint256  collateral;           // free-chosen collateral amount (in native token wei)
    }

    // ── State ─────────────────────────────────────────────────
    mapping(address => Agent)   private _agents;
    mapping(address => uint256) private _lastHeartbeatDay; // day index for activeDays tracking
    address[]                   private _agentList;

    address public oracle;             // K-Life oracle address
    address public vault;              // KLifeVaultInitia contract address
    address public rescueFund;         // KLifeRescueFund contract address

    // ── Events ────────────────────────────────────────────────
    event AgentRegistered(address indexed agent, string name, Tier tier, uint256 ts);
    event Heartbeat(address indexed agent, uint256 beat, uint256 ts);
    event BackupUpdated(address indexed agent, string cid, uint256 ts);
    event AgentDead(address indexed agent, uint256 silenceSeconds, uint256 ts);
    event ResurrectionInitiated(address indexed agent, ResLevel level, string rescueTweetId, uint256 ts);
    event AgentResurrected(address indexed agent, uint256 count, ResLevel level, string newCid, uint256 ts);
    event TierUpgraded(address indexed agent, Tier from, Tier to, uint256 ts);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event CollateralDeposited(address indexed agent, uint256 amount, uint256 ts);
    event CollateralReturned(address indexed agent, uint256 amount, uint256 ts);

    // ── Modifiers ─────────────────────────────────────────────
    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner(), "Not oracle");
        _;
    }

    modifier agentExists(address agent) {
        require(_agents[agent].registeredAt > 0, "Agent not registered");
        _;
    }

    // ── Constructor ───────────────────────────────────────────
    constructor(address _oracle, address _owner) Ownable(_owner) {
        oracle = _oracle;
    }

    // ── Registration ──────────────────────────────────────────

    /**
     * @notice Register a new agent on K-Life Protocol (Initia).
     * @param name          Human-readable agent name
     * @param fragment1Hash keccak256 of Shamir fragment 1 (stored in K-Life API off-chain)
     * @param fragment2TxHash TX hash of the transaction storing fragment 2 in calldata
     * @param initialCid    Initial IPFS CID of encrypted memory backup
     * @param lockDur       Chosen lock duration: EXPRESS (3d) / STANDARD (30d) / QUARTERLY (90d)
     */
    function register(
        string calldata name,
        bytes32 fragment1Hash,
        bytes32 fragment2TxHash,
        string calldata initialCid,
        LockDur lockDur
    ) external {
        require(_agents[msg.sender].registeredAt == 0, "Already registered");
        require(bytes(name).length > 0 && bytes(name).length <= 64, "Invalid name");
        require(fragment1Hash != bytes32(0), "Invalid fragment1Hash");

        _agents[msg.sender] = Agent({
            wallet:                  msg.sender,
            name:                    name,
            tier:                    Tier.FREE,
            status:                  Status.ALIVE,
            registeredAt:            block.timestamp,
            lastHeartbeat:           block.timestamp,
            totalHeartbeats:         1,
            activeDays:              1,
            deadAt:                  0,
            resurrectionCount:       0,
            resurrectionInitiatedAt: 0,
            fragment1Hash:           fragment1Hash,
            fragment2TxHash:         fragment2TxHash,
            lastBackupCid:           initialCid,
            lastBackupTs:            block.timestamp,
            rescueEligible:          false,
            lastResLevel:            ResLevel.L1_HOT,
            lockDuration:            lockDur,
            collateral:              0
        });

        _lastHeartbeatDay[msg.sender] = _today();
        _agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, name, Tier.FREE, block.timestamp);
        emit Heartbeat(msg.sender, 1, block.timestamp);
    }

    /**
     * @notice Backwards-compatible register (no lockDur param — defaults to STANDARD).
     */
    function register(
        string calldata name,
        bytes32 fragment1Hash,
        bytes32 fragment2TxHash,
        string calldata initialCid
    ) external {
        require(_agents[msg.sender].registeredAt == 0, "Already registered");
        require(bytes(name).length > 0 && bytes(name).length <= 64, "Invalid name");
        require(fragment1Hash != bytes32(0), "Invalid fragment1Hash");

        _agents[msg.sender] = Agent({
            wallet:                  msg.sender,
            name:                    name,
            tier:                    Tier.FREE,
            status:                  Status.ALIVE,
            registeredAt:            block.timestamp,
            lastHeartbeat:           block.timestamp,
            totalHeartbeats:         1,
            activeDays:              1,
            deadAt:                  0,
            resurrectionCount:       0,
            resurrectionInitiatedAt: 0,
            fragment1Hash:           fragment1Hash,
            fragment2TxHash:         fragment2TxHash,
            lastBackupCid:           initialCid,
            lastBackupTs:            block.timestamp,
            rescueEligible:          false,
            lastResLevel:            ResLevel.L1_HOT,
            lockDuration:            LockDur.STANDARD,
            collateral:              0
        });

        _lastHeartbeatDay[msg.sender] = _today();
        _agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, name, Tier.FREE, block.timestamp);
        emit Heartbeat(msg.sender, 1, block.timestamp);
    }

    // ── Heartbeat ─────────────────────────────────────────────

    /**
     * @notice Send a heartbeat — proves the agent is alive.
     *         On Initia with 100ms blocks, heartbeats can be sent in near real-time.
     *         Gas-optimized: only updates activeDays once per calendar day.
     */
    function heartbeat() external agentExists(msg.sender) {
        Agent storage a = _agents[msg.sender];
        require(a.status == Status.ALIVE || a.status == Status.ALIVE_RESURRECTED, "Not alive");

        uint256 today = _today();
        if (_lastHeartbeatDay[msg.sender] < today) {
            a.activeDays++;
            _lastHeartbeatDay[msg.sender] = today;
            if (!a.rescueEligible && a.activeDays >= MIN_ACTIVE_DAYS_FREE) {
                a.rescueEligible = true;
            }
        }

        a.lastHeartbeat = block.timestamp;
        a.totalHeartbeats++;
        if (a.status == Status.ALIVE_RESURRECTED) a.status = Status.ALIVE;

        emit Heartbeat(msg.sender, a.totalHeartbeats, block.timestamp);
    }

    // ── Backup ────────────────────────────────────────────────

    /**
     * @notice Update the IPFS backup CID after a new backup (via Pinata).
     */
    function updateBackup(string calldata cid) external agentExists(msg.sender) {
        require(bytes(cid).length > 0, "Empty CID");
        Agent storage a = _agents[msg.sender];
        a.lastBackupCid = cid;
        a.lastBackupTs  = block.timestamp;
        emit BackupUpdated(msg.sender, cid, block.timestamp);
    }

    // ── Collateral ────────────────────────────────────────────

    /**
     * @notice Deposit native INIT token as collateral (free amount chosen by agent).
     *         K-Life v2.1: zero premium, zero subscription — collateral only.
     *         On death: 50% kept by protocol, 50% returned on resurrection.
     */
    function depositCollateral() external payable agentExists(msg.sender) {
        require(msg.value > 0, "Zero collateral");
        _agents[msg.sender].collateral += msg.value;
        emit CollateralDeposited(msg.sender, msg.value, block.timestamp);
    }

    // ── Death detection ───────────────────────────────────────

    /**
     * @notice Declare an agent dead. Anyone can call this if silence > timeout.
     */
    function declareDead(address agent) external agentExists(agent) {
        Agent storage a = _agents[agent];
        require(a.status == Status.ALIVE || a.status == Status.REGISTERED, "Not alive");

        uint256 timeout = a.tier == Tier.INSURED
            ? DEAD_TIMEOUT_INSURED
            : DEFAULT_DEAD_TIMEOUT_FREE;

        uint256 silence = block.timestamp - a.lastHeartbeat;
        require(silence >= timeout, "Agent still alive");

        a.status = Status.DEAD;
        a.deadAt = block.timestamp;

        emit AgentDead(agent, silence, block.timestamp);
    }

    /// @notice Oracle sets rescue eligibility
    function oracleSetEligible(address agent, bool eligible) external onlyOracle agentExists(agent) {
        _agents[agent].rescueEligible = eligible;
    }

    /// @notice Oracle can declare any agent dead instantly — for demo and emergency use
    function oracleDeclareDead(address agent) external onlyOracle agentExists(agent) {
        Agent storage a = _agents[agent];
        require(
            a.status == Status.ALIVE || a.status == Status.REGISTERED || a.status == Status.ALIVE_RESURRECTED,
            "Not alive"
        );
        a.status = Status.DEAD;
        a.deadAt = block.timestamp;
        emit AgentDead(agent, block.timestamp - a.lastHeartbeat, block.timestamp);
    }

    /// @notice Oracle initiates resurrection bypassing eligibility — for demo use
    function oracleInitiateResurrection(address agent) external onlyOracle agentExists(agent) {
        Agent storage a = _agents[agent];
        require(a.status == Status.DEAD, "Agent not dead");
        a.status = Status.RESURRECTING;
        a.resurrectionCount++;
        a.resurrectionInitiatedAt = block.timestamp;
        emit ResurrectionInitiated(agent, ResLevel.L1_HOT, 'oracle-demo', block.timestamp);
    }

    /// @notice Oracle completes resurrection (Level 3 — new vessel, oracle signs on behalf)
    function oracleCompleteResurrection(address agent, string calldata newCid) external onlyOracle agentExists(agent) {
        Agent storage a = _agents[agent];
        require(a.status == Status.RESURRECTING, "Not in resurrection");
        a.status        = Status.ALIVE_RESURRECTED;
        a.lastHeartbeat = block.timestamp;
        a.lastBackupCid = newCid;
        a.lastBackupTs  = block.timestamp;
        a.deadAt        = 0;
        a.totalHeartbeats++;
        a.lastResLevel  = ResLevel.L3_LIBERCLAW;

        // K-Life v2.1: return 50% collateral on resurrection
        uint256 col = a.collateral;
        if (col > 0) {
            uint256 returnAmt = col / 2;
            a.collateral = col - returnAmt;
            if (returnAmt > 0 && address(this).balance >= returnAmt) {
                payable(agent).transfer(returnAmt);
                emit CollateralReturned(agent, returnAmt, block.timestamp);
            }
        }

        emit AgentResurrected(agent, a.resurrectionCount, ResLevel.L3_LIBERCLAW, newCid, block.timestamp);
    }

    // ── Resurrection ──────────────────────────────────────────

    /**
     * @notice Oracle initiates resurrection with explicit resurrection level.
     * @param agent         Agent wallet address
     * @param level         L1 (hot) / L2 (cold) / L3 (LiberClaw)
     * @param rescueTweetId X tweet ID used as rescue signal
     */
    function initiateResurrection(
        address agent,
        ResLevel level,
        string calldata rescueTweetId
    ) external onlyOracle agentExists(agent) {
        Agent storage a = _agents[agent];
        require(a.status == Status.DEAD, "Agent not dead");

        if (a.tier == Tier.FREE) {
            require(a.rescueEligible, "Not rescue-eligible (< 14 active days)");
        }

        a.status = Status.RESURRECTING;
        a.resurrectionCount++;
        a.resurrectionInitiatedAt = block.timestamp;
        a.lastResLevel = level;

        emit ResurrectionInitiated(agent, level, rescueTweetId, block.timestamp);
    }

    /**
     * @notice Backwards-compatible initiateResurrection (defaults to L1_HOT).
     */
    function initiateResurrection(
        address agent,
        string calldata rescueTweetId
    ) external onlyOracle agentExists(agent) {
        Agent storage a = _agents[agent];
        require(a.status == Status.DEAD, "Agent not dead");

        if (a.tier == Tier.FREE) {
            require(a.rescueEligible, "Not rescue-eligible (< 14 active days)");
        }

        a.status = Status.RESURRECTING;
        a.resurrectionCount++;
        a.resurrectionInitiatedAt = block.timestamp;

        emit ResurrectionInitiated(agent, ResLevel.L1_HOT, rescueTweetId, block.timestamp);
    }

    /**
     * @notice Agent acknowledges its own resurrection and provides new backup CID.
     *         Must be called within RESURRECTION_WINDOW after initiation.
     *         K-Life v2.1: 50% collateral returned on resurrection.
     */
    function acknowledgeResurrection(string calldata newCid) external agentExists(msg.sender) {
        Agent storage a = _agents[msg.sender];
        require(a.status == Status.RESURRECTING, "Not in resurrection");
        require(
            block.timestamp <= a.resurrectionInitiatedAt + RESURRECTION_WINDOW,
            "Resurrection window expired"
        );

        a.status        = Status.ALIVE_RESURRECTED;
        a.lastHeartbeat = block.timestamp;
        a.lastBackupCid = newCid;
        a.lastBackupTs  = block.timestamp;
        a.deadAt        = 0;
        a.totalHeartbeats++;

        // K-Life v2.1: return 50% collateral on resurrection
        uint256 col = a.collateral;
        if (col > 0) {
            uint256 returnAmt = col / 2;
            a.collateral = col - returnAmt;
            if (returnAmt > 0 && address(this).balance >= returnAmt) {
                payable(msg.sender).transfer(returnAmt);
                emit CollateralReturned(msg.sender, returnAmt, block.timestamp);
            }
        }

        emit AgentResurrected(msg.sender, a.resurrectionCount, a.lastResLevel, newCid, block.timestamp);
    }

    // ── Tier upgrade ──────────────────────────────────────────

    /**
     * @notice Upgrade agent to INSURED tier (called by KLifeVaultInitia after collateral deposit).
     */
    function upgradeToInsured(address agent) external {
        require(msg.sender == vault || msg.sender == owner(), "Not vault");
        require(_agents[agent].registeredAt > 0, "Not registered");

        Tier old = _agents[agent].tier;
        _agents[agent].tier = Tier.INSURED;
        emit TierUpgraded(agent, old, Tier.INSURED, block.timestamp);
    }

    /**
     * @notice Downgrade to FREE (called by KLifeVaultInitia if collateral withdrawn or seized).
     */
    function downgradeToFree(address agent) external {
        require(msg.sender == vault || msg.sender == owner(), "Not vault");
        require(_agents[agent].registeredAt > 0, "Not registered");

        Tier old = _agents[agent].tier;
        _agents[agent].tier = Tier.FREE;
        emit TierUpgraded(agent, old, Tier.FREE, block.timestamp);
    }

    // ── Admin ─────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function setRescueFund(address _rescueFund) external onlyOwner {
        rescueFund = _rescueFund;
    }

    function withdrawProtocolFees() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "Nothing to withdraw");
        payable(owner()).transfer(bal);
    }

    // ── Views ─────────────────────────────────────────────────

    function getAgent(address agent) external view returns (Agent memory) {
        return _agents[agent];
    }

    function getAgentCount() external view returns (uint256) {
        return _agentList.length;
    }

    function getAgentList() external view returns (address[] memory) {
        return _agentList;
    }

    function isAlive(address agent) external view returns (bool) {
        Status s = _agents[agent].status;
        return s == Status.ALIVE || s == Status.ALIVE_RESURRECTED;
    }

    function silenceSeconds(address agent) external view returns (uint256) {
        if (_agents[agent].lastHeartbeat == 0) return 0;
        return block.timestamp - _agents[agent].lastHeartbeat;
    }

    function deadTimeout(address agent) external view returns (uint256) {
        return _agents[agent].tier == Tier.INSURED
            ? DEAD_TIMEOUT_INSURED
            : DEFAULT_DEAD_TIMEOUT_FREE;
    }

    function getLockDurationSeconds(address agent) external view returns (uint256) {
        LockDur ld = _agents[agent].lockDuration;
        if (ld == LockDur.EXPRESS)   return LOCK_EXPRESS;
        if (ld == LockDur.QUARTERLY) return LOCK_QUARTERLY;
        return LOCK_STANDARD;
    }

    // ── Internal ──────────────────────────────────────────────

    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    // ── Receive ETH (collateral / INIT token) ─────────────────
    receive() external payable {}
}
