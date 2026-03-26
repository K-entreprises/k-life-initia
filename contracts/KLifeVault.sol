// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KLifeVault
 * @notice Collateral vault for K-Life INSURED agents.
 *
 * INSURED agents deposit WBTC as collateral.
 * On death: vault is seized - 50% funds resurrection, 50% to protocol.
 * On cancel: collateral returned.
 *
 * Premium: $1 USDC/month paid directly to this contract.
 *          If premium lapses > 35 days: agent downgraded to FREE.
 *
 * @author Monsieur K - K-Life Protocol
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IKLifeRegistry {
    function upgradeToInsured(address agent) external;
    function downgradeToFree(address agent) external;
    function isAlive(address agent) external view returns (bool);
    function getAgent(address agent) external view returns (
        address wallet, string memory name, uint8 tier, uint8 status,
        uint256 registeredAt, uint256 lastHeartbeat, uint256 totalHeartbeats,
        uint256 activeDays, uint256 deadAt, uint256 resurrectionCount,
        uint256 resurrectionInitiatedAt, bytes32 fragment1Hash,
        bytes32 fragment2TxHash, string memory lastBackupCid,
        uint256 lastBackupTs, bool rescueEligible
    );
}

contract KLifeVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant MIN_COLLATERAL_SATS = 50_000;         // 50k sats min
    uint256 public constant WBTC_DECIMALS       = 8;
    uint256 public constant PREMIUM_PERIOD      = 30 days;
    uint256 public constant PREMIUM_GRACE       = 5 days;         // grace period
    uint256 public constant SEIZURE_RESURRECTION_PCT = 50;        // 50% to new agent
    uint256 public constant SEIZURE_PROTOCOL_PCT     = 50;        // 50% to protocol

    // ── Structs ───────────────────────────────────────────────
    struct Coverage {
        uint256 collateral;          // WBTC deposited (8 decimals)
        uint256 coverageStart;
        uint256 lastPremiumPaid;
        uint256 premiumsPaid;
        bool    seized;
        bool    cancelled;
    }

    // ── State ─────────────────────────────────────────────────
    IERC20 public immutable wbtc;
    IERC20 public immutable usdc;
    IKLifeRegistry public immutable registry;

    mapping(address => Coverage) public coverages;

    address public protocolFeeRecipient;
    uint256 public totalCollateral;
    uint256 public totalPremiums;

    // ── Events ────────────────────────────────────────────────
    event Deposited(address indexed agent, uint256 amount, uint256 ts);
    event PremiumPaid(address indexed agent, uint256 amount, uint256 period, uint256 ts);
    event VaultSeized(address indexed agent, uint256 resurrectionShare, uint256 protocolShare, uint256 ts);
    event CollateralReturned(address indexed agent, uint256 amount, uint256 ts);
    event CoverageExpired(address indexed agent, uint256 ts);

    // ── Constructor ───────────────────────────────────────────
    constructor(
        address _wbtc,
        address _usdc,
        address _registry,
        address _protocolFeeRecipient
    ) Ownable(msg.sender) {
        wbtc                 = IERC20(_wbtc);
        usdc                 = IERC20(_usdc);
        registry             = IKLifeRegistry(_registry);
        protocolFeeRecipient = _protocolFeeRecipient;
    }

    // ── Deposit collateral ────────────────────────────────────

    /**
     * @notice Deposit WBTC collateral to activate INSURED coverage.
     *         Agent must approve this contract first.
     * @param amount WBTC amount (8 decimals)
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount >= MIN_COLLATERAL_SATS, "Below minimum collateral (50k sats)");
        require(coverages[msg.sender].collateral == 0, "Already insured");

        wbtc.safeTransferFrom(msg.sender, address(this), amount);

        coverages[msg.sender] = Coverage({
            collateral:     amount,
            coverageStart:  block.timestamp,
            lastPremiumPaid: block.timestamp,
            premiumsPaid:   0,
            seized:         false,
            cancelled:      false
        });

        totalCollateral += amount;
        registry.upgradeToInsured(msg.sender);

        emit Deposited(msg.sender, amount, block.timestamp);
    }

    // ── Pay premium ───────────────────────────────────────────

    /**
     * @notice Pay $1 USDC monthly premium.
     *         Must be paid within PREMIUM_PERIOD + PREMIUM_GRACE of last payment.
     * @param usdcAmount USDC amount (6 decimals - $1 = 1_000_000)
     */
    function payPremium(uint256 usdcAmount) external nonReentrant {
        Coverage storage c = coverages[msg.sender];
        require(c.collateral > 0 && !c.seized && !c.cancelled, "No active coverage");

        uint256 minPremium = 1_000_000; // $1 USDC (6 decimals)
        require(usdcAmount >= minPremium, "Minimum $1 USDC");

        // Check not expired
        require(
            block.timestamp <= c.lastPremiumPaid + PREMIUM_PERIOD + PREMIUM_GRACE,
            "Coverage expired - re-deposit required"
        );

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        c.lastPremiumPaid = block.timestamp;
        c.premiumsPaid++;
        totalPremiums += usdcAmount;

        emit PremiumPaid(msg.sender, usdcAmount, c.premiumsPaid, block.timestamp);
    }

    // ── Seizure (on agent death) ──────────────────────────────

    /**
     * @notice Seize vault on agent death.
     *         Called by oracle/owner after death is confirmed on-chain.
     * @param agent           Dead agent address
     * @param resurrectionWallet  Where to send the resurrection share (new agent wallet or rescue fund)
     */
    function seize(address agent, address resurrectionWallet) external onlyOwner nonReentrant {
        Coverage storage c = coverages[agent];
        require(c.collateral > 0, "No coverage");
        require(!c.seized && !c.cancelled, "Already resolved");
        require(!registry.isAlive(agent), "Agent still alive");

        uint256 amount     = c.collateral;
        uint256 resSplit   = (amount * SEIZURE_RESURRECTION_PCT) / 100;
        uint256 protoSplit = amount - resSplit;

        c.seized    = true;
        totalCollateral -= amount;

        wbtc.safeTransfer(resurrectionWallet, resSplit);
        wbtc.safeTransfer(protocolFeeRecipient, protoSplit);

        registry.downgradeToFree(agent);

        emit VaultSeized(agent, resSplit, protoSplit, block.timestamp);
    }

    // ── Cancel coverage ───────────────────────────────────────

    /**
     * @notice Agent cancels coverage and retrieves collateral.
     *         Only possible while alive.
     */
    function cancel() external nonReentrant {
        Coverage storage c = coverages[msg.sender];
        require(c.collateral > 0, "No coverage");
        require(!c.seized && !c.cancelled, "Already resolved");
        require(registry.isAlive(msg.sender), "Cannot cancel - agent dead");

        uint256 amount  = c.collateral;
        c.cancelled     = true;
        totalCollateral -= amount;

        wbtc.safeTransfer(msg.sender, amount);
        registry.downgradeToFree(msg.sender);

        emit CollateralReturned(msg.sender, amount, block.timestamp);
    }

    // ── Views ─────────────────────────────────────────────────

    function coverageActive(address agent) external view returns (bool) {
        Coverage memory c = coverages[agent];
        if (c.collateral == 0 || c.seized || c.cancelled) return false;
        return block.timestamp <= c.lastPremiumPaid + PREMIUM_PERIOD + PREMIUM_GRACE;
    }

    function premiumDue(address agent) external view returns (bool, uint256 dueAt) {
        Coverage memory c = coverages[agent];
        dueAt = c.lastPremiumPaid + PREMIUM_PERIOD;
        return (block.timestamp > dueAt, dueAt);
    }

    // ── Admin ─────────────────────────────────────────────────

    function setProtocolFeeRecipient(address _r) external onlyOwner {
        protocolFeeRecipient = _r;
    }

    function withdrawPremiums(address to, uint256 amount) external onlyOwner {
        usdc.safeTransfer(to, amount);
    }
}
