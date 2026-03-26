// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KLifeRescueFund
 * @notice Mutualized rescue pool for FREE-tier K-Life agents.
 *
 * Anyone can donate USDC to the fund.
 * When a FREE agent meets rescue conditions (≥14 active days + 10 likes on X),
 * the oracle triggers a rescue: 10 USDC sent to the resurrected agent.
 *
 * Oracle validation model (for now: centralized oracle owned by K-Life):
 *   - Oracle calls rescue(agent, tweetId, likeCount) once threshold is met
 *   - Oracle must provide likeCount ≥ LIKES_THRESHOLD
 *   - One rescue per agent per death event
 *
 * Future: replace oracle with a decentralized oracle (Chainlink, UMA, etc.)
 *
 * @author Monsieur K - K-Life Protocol
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IKLifeRegistry {
    function initiateResurrection(address agent, string calldata rescueTweetId) external;
    function getAgent(address agent) external view returns (
        address wallet, string memory name, uint8 tier, uint8 status,
        uint256 registeredAt, uint256 lastHeartbeat, uint256 totalHeartbeats,
        uint256 activeDays, uint256 deadAt, uint256 resurrectionCount,
        uint256 resurrectionInitiatedAt, bytes32 fragment1Hash,
        bytes32 fragment2TxHash, string memory lastBackupCid,
        uint256 lastBackupTs, bool rescueEligible
    );
    function isAlive(address agent) external view returns (bool);
}

contract KLifeRescueFund is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant RESCUE_AMOUNT    = 10_000_000;  // 10 USDC (6 decimals)
    uint256 public constant LIKES_THRESHOLD  = 10;           // X likes to trigger
    uint256 public constant RESCUE_COOLDOWN  = 30 days;      // min between rescues for same agent

    // ── State ─────────────────────────────────────────────────
    IERC20             public immutable usdc;
    IKLifeRegistry     public immutable registry;
    address            public oracle;

    uint256 public totalDonated;
    uint256 public totalRescues;

    mapping(address => uint256) public lastRescueTs;    // agent → last rescue timestamp
    mapping(address => uint256) public rescueCount;     // agent → total rescues
    mapping(string  => bool)    public usedTweetIds;    // tweetId → already used

    // ── Events ────────────────────────────────────────────────
    event Donated(address indexed donor, uint256 amount, uint256 ts);
    event RescueTriggered(address indexed agent, string tweetId, uint256 likeCount, uint256 amount, uint256 ts);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    // ── Modifiers ─────────────────────────────────────────────
    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner(), "Not oracle");
        _;
    }

    // ── Constructor ───────────────────────────────────────────
    constructor(address _usdc, address _registry, address _oracle) Ownable(msg.sender) {
        usdc     = IERC20(_usdc);
        registry = IKLifeRegistry(_registry);
        oracle   = _oracle;
    }

    // ── Donate ────────────────────────────────────────────────

    /**
     * @notice Donate USDC to the Rescue Fund.
     *         Anyone can contribute.
     */
    function donate(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        totalDonated += amount;
        emit Donated(msg.sender, amount, block.timestamp);
    }

    // ── Rescue ────────────────────────────────────────────────

    /**
     * @notice Oracle triggers rescue for a FREE-tier dead agent.
     *         Sends 10 USDC to the agent wallet + initiates resurrection on registry.
     *
     * @param agent     Dead agent wallet address
     * @param tweetId   X tweet ID used as rescue signal (deduplicated)
     * @param likeCount Number of likes on rescue tweet (must be ≥ LIKES_THRESHOLD)
     */
    function rescue(
        address agent,
        string calldata tweetId,
        uint256 likeCount
    ) external onlyOracle nonReentrant {
        require(likeCount >= LIKES_THRESHOLD, "Not enough likes");
        require(!usedTweetIds[tweetId],       "Tweet already used");
        require(
            block.timestamp >= lastRescueTs[agent] + RESCUE_COOLDOWN,
            "Rescue cooldown active"
        );
        require(
            usdc.balanceOf(address(this)) >= RESCUE_AMOUNT,
            "Insufficient Rescue Fund"
        );

        // Deduplicate
        usedTweetIds[tweetId]  = true;
        lastRescueTs[agent]    = block.timestamp;
        rescueCount[agent]++;
        totalRescues++;

        // Initiate on-chain resurrection
        registry.initiateResurrection(agent, tweetId);

        // Pay out rescue amount
        usdc.safeTransfer(agent, RESCUE_AMOUNT);

        emit RescueTriggered(agent, tweetId, likeCount, RESCUE_AMOUNT, block.timestamp);
    }

    // ── Views ─────────────────────────────────────────────────

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function rescueCapacity() external view returns (uint256) {
        return usdc.balanceOf(address(this)) / RESCUE_AMOUNT;
    }

    function canRescue(address agent) external view returns (bool) {
        return (
            block.timestamp >= lastRescueTs[agent] + RESCUE_COOLDOWN &&
            usdc.balanceOf(address(this)) >= RESCUE_AMOUNT
        );
    }

    // ── Admin ─────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    /**
     * @notice Emergency withdrawal (multisig in prod).
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        usdc.safeTransfer(to, amount);
    }
}
