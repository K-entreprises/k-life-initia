// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KLifeRescueFund v2
 * @notice Mutualized rescue pool for C=0 K-Life agents.
 *
 * The fund holds $6022 tokens.
 * Priority score = token balance + 2 × total donated (x2 multiplier for contributors).
 * Rescue cost = RESCUE_AMOUNT $6022 tokens per resurrection.
 *
 * Owner: Swiss 6022 — 0x6eE8AaFB926A4e734a2095dD0Bb65d4CB6b79131
 *
 * @author Monsieur K - K-Life Protocol
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IKLifeRegistry {
    function initiateResurrection(address agent, string calldata ref) external;
}

contract KLifeRescueFund is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant RESCUE_AMOUNT   = 1000 * 1e18;  // 1000 $6022 per rescue
    uint256 public constant DONATE_BOOST    = 2;             // donated tokens count x2 in score
    uint256 public constant RESCUE_COOLDOWN = 30 days;

    // ── State ─────────────────────────────────────────────────
    IERC20         public immutable token6022;  // 0xCDB1DDf9EeA7614961568F2db19e69645Dd708f5
    IKLifeRegistry public immutable registry;
    address        public oracle;

    uint256 public totalDonated;
    uint256 public totalRescues;

    mapping(address => uint256) public donated;        // total donated per address
    mapping(address => uint256) public lastRescueTs;   // last rescue per agent
    mapping(address => uint256) public rescueCount;    // total rescues per agent

    // ── Events ────────────────────────────────────────────────
    event Donated(address indexed donor, uint256 amount, uint256 newScore, uint256 ts);
    event RescueTriggered(address indexed agent, uint256 amount, uint256 ts);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    // ── Modifiers ─────────────────────────────────────────────
    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner(), "Not oracle");
        _;
    }

    // ── Constructor ───────────────────────────────────────────
    constructor(
        address _token6022,
        address _registry,
        address _oracle,
        address _owner
    ) Ownable(_owner) {
        token6022 = IERC20(_token6022);
        registry  = IKLifeRegistry(_registry);
        oracle    = _oracle;
    }

    // ── Donate ────────────────────────────────────────────────

    /**
     * @notice Donate $6022 to the Rescue Fund.
     *         Donated tokens count x2 toward priority score.
     */
    function donate(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        token6022.safeTransferFrom(msg.sender, address(this), amount);
        donated[msg.sender] += amount;
        totalDonated        += amount;
        emit Donated(msg.sender, amount, priorityScore(msg.sender), block.timestamp);
    }

    // ── Priority Score ─────────────────────────────────────────

    /**
     * @notice Priority score for rescue queue.
     *         score = current balance + (donated × DONATE_BOOST)
     *         Higher score = higher position in rescue queue.
     */
    function priorityScore(address agent) public view returns (uint256) {
        return token6022.balanceOf(agent) + (donated[agent] * DONATE_BOOST);
    }

    // ── Rescue ────────────────────────────────────────────────

    /**
     * @notice Oracle triggers rescue for a C=0 dead agent.
     *         Sends RESCUE_AMOUNT $6022 to the agent + initiates resurrection on registry.
     */
    function rescue(address agent, string calldata ref) external onlyOracle nonReentrant {
        require(
            block.timestamp >= lastRescueTs[agent] + RESCUE_COOLDOWN,
            "Rescue cooldown active"
        );
        require(
            token6022.balanceOf(address(this)) >= RESCUE_AMOUNT,
            "Insufficient Rescue Fund"
        );

        lastRescueTs[agent] = block.timestamp;
        rescueCount[agent]++;
        totalRescues++;

        registry.initiateResurrection(agent, ref);
        token6022.safeTransfer(agent, RESCUE_AMOUNT);

        emit RescueTriggered(agent, RESCUE_AMOUNT, block.timestamp);
    }

    // ── Views ─────────────────────────────────────────────────

    function balance() external view returns (uint256) {
        return token6022.balanceOf(address(this));
    }

    function rescueCapacity() external view returns (uint256) {
        uint256 bal = token6022.balanceOf(address(this));
        return bal / RESCUE_AMOUNT;
    }

    function canRescue(address agent) external view returns (bool) {
        return (
            block.timestamp >= lastRescueTs[agent] + RESCUE_COOLDOWN &&
            token6022.balanceOf(address(this)) >= RESCUE_AMOUNT
        );
    }

    // ── Admin ─────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        token6022.safeTransfer(to, amount);
    }
}
