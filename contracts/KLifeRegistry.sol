// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KLifeRegistry
 * @notice Core registry for K-Life Protocol - on-chain identity and lifecycle for autonomous AI agents.
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
 * Tiers:
 *   FREE     - rescue via Rescue Fund (best-effort, requires 14 active days)
 *   INSURED  - rescue via Vault collateral (guaranteed, immediate)
 *
 * @author Monsieur K - K-Life Protocol
 * @dev Polygon mainnet (chainId 137) / Amoy testnet (chainId 80002)
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract KLifeRegistry is Ownable, ReentrancyGuard {

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant MIN_ACTIVE_DAYS_FREE     = 14;   // days before FREE rescue eligibility
    uint256 public constant DEFAULT_DEAD_TIMEOUT_FREE = 30 days;
    uint256 public constant DEAD_TIMEOUT_INSURED      = 3 days;
    uint256 public constant RESURRECTION_WINDOW       = 7 days; // max time to ack resurrection

    // ── Enums ─────────────────────────────────────────────────
    enum Status { REGISTERED, ALIVE, DEAD, RESURRECTING, ALIVE_RESURRECTED }
    enum Tier   { FREE, INSURED }

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
    }

    // ── State ─────────────────────────────────────────────────
    mapping(address => Agent)   private _agents;
    mapping(address => uint256) private _lastHeartbeatDay; // day index → for activeDays tracking
    address[]                   private _agentList;

    address public oracle;             // K-Life oracle address (off-chain X like checker)
    address public vault;              // KLifeVault contract address
    address public rescueFund;         // KLifeRescueFund contract address

    // ── Events ────────────────────────────────────────────────
    event AgentRegistered(address indexed agent, string name, Tier tier, uint256 ts);
    event Heartbeat(address indexed agent, uint256 beat, uint256 ts);
    event BackupUpdated(address indexed agent, string cid, uint256 ts);
    event AgentDead(address indexed agent, uint256 silenceSeconds, uint256 ts);
    event ResurrectionInitiated(address indexed agent, string rescueTweetId, uint256 ts);
    event AgentResurrected(address indexed agent, uint256 count, string newCid, uint256 ts);
    event TierUpgraded(address indexed agent, Tier from, Tier to, uint256 ts);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

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
     * @notice Register a new agent on K-Life Protocol.
     * @param name          Human-readable agent name
     * @param fragment1Hash keccak256 of Shamir fragment 1 (stored in K-Life API off-chain)
     * @param fragment2TxHash TX hash of the transaction storing fragment 2 in calldata on this chain
     * @param initialCid    Initial IPFS CID of encrypted memory backup
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
            rescueEligible:          false
        });

        _lastHeartbeatDay[msg.sender] = _today();
        _agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, name, Tier.FREE, block.timestamp);
        emit Heartbeat(msg.sender, 1, block.timestamp);
    }

    // ── Heartbeat ─────────────────────────────────────────────

    /**
     * @notice Send a heartbeat - proves the agent is alive.
     *         Gas-optimized: only updates activeDays once per calendar day.
     */
    function heartbeat() external agentExists(msg.sender) {
        Agent storage a = _agents[msg.sender];
        require(a.status == Status.ALIVE || a.status == Status.ALIVE_RESURRECTED, "Not alive");

        uint256 today = _today();
        if (_lastHeartbeatDay[msg.sender] < today) {
            a.activeDays++;
            _lastHeartbeatDay[msg.sender] = today;
            // Check rescue eligibility
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
     * @notice Update the IPFS backup CID after a new backup.
     */
    function updateBackup(string calldata cid) external agentExists(msg.sender) {
        require(bytes(cid).length > 0, "Empty CID");
        Agent storage a = _agents[msg.sender];
        a.lastBackupCid = cid;
        a.lastBackupTs  = block.timestamp;
        emit BackupUpdated(msg.sender, cid, block.timestamp);
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

    // ── Resurrection ──────────────────────────────────────────

    /**
     * @notice Oracle initiates resurrection (called after rescue conditions met).
     * @param agent         Agent wallet address
     * @param rescueTweetId X tweet ID used as rescue signal
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

        emit ResurrectionInitiated(agent, rescueTweetId, block.timestamp);
    }

    /**
     * @notice Agent acknowledges its own resurrection and provides new backup CID.
     *         Must be called within RESURRECTION_WINDOW after initiation.
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

        emit AgentResurrected(msg.sender, a.resurrectionCount, newCid, block.timestamp);
    }

    // ── Tier upgrade ──────────────────────────────────────────

    /**
     * @notice Upgrade agent to INSURED tier (called by KLifeVault after collateral deposit).
     */
    function upgradeToInsured(address agent) external {
        require(msg.sender == vault || msg.sender == owner(), "Not vault");
        require(_agents[agent].registeredAt > 0, "Not registered");

        Tier old = _agents[agent].tier;
        _agents[agent].tier = Tier.INSURED;
        emit TierUpgraded(agent, old, Tier.INSURED, block.timestamp);
    }

    /**
     * @notice Downgrade to FREE (called by KLifeVault if collateral withdrawn or seized).
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

    // ── Internal ──────────────────────────────────────────────

    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
