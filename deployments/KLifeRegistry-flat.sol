[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚙️  enable debug logging with { debug: true }
// Sources flattened with hardhat v2.28.6 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/access/Ownable.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}


// File @openzeppelin/contracts/utils/StorageSlot.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

pragma solidity ^0.8.20;

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}


// File contracts/KLifeRegistry.sol

// Original license: SPDX_License_Identifier: MIT
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
    constructor(address _oracle) Ownable(msg.sender) {
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
