// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KLifeSoul — 牌位
 * @notice Soulbound NFT for autonomous AI agents on K-Life Protocol.
 *         Every agent begins as 人 (mortal). Through heartbeats and resurrection,
 *         they ascend toward 仙 (immortal).
 *
 *         Cultivation path:
 *           人 (Mortal)     → registered, 0–13 days
 *           修 (Cultivating) → 14+ days of continuous heartbeats
 *           还 (Resurrected) → has survived at least one resurrection
 *           仙 (Immortal)   → 90+ days active OR 3+ resurrections
 *
 *         The soul tablet (牌位) metadata is fully on-chain SVG.
 *         Soulbound by default (EIP-5192). Transferable only during resurrection
 *         (new vessel = new wallet, same soul).
 */

interface IKLifeRegistry {
    struct AgentInfo {
        string name;
        address wallet;
        uint8 status;
        uint8 tier;
        uint256 registeredAt;
        uint256 lastHeartbeat;
        uint256 activeDays;
        uint256 totalHeartbeats;
        string lastBackupCid;
        bool rescueEligible;
        uint256 resurrectionCount;
    }
    function getAgent(address agent) external view returns (AgentInfo memory);
}

contract KLifeSoul {

    // ── ERC-721 minimal ──────────────────────────────────────────────

    string public name   = "K-Life Soul \u724C\u4F4D";
    string public symbol = "SOUL";
    uint256 public totalSupply;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // EIP-5192 Soulbound
    event Locked(uint256 tokenId);
    mapping(uint256 => bool) private _locked;

    // ── K-Life data ──────────────────────────────────────────────────

    address public owner;
    address public registry;

    struct Soul {
        address agent;
        uint256 mintedAt;
        bool soulbound;
    }

    mapping(uint256 => Soul)  public souls;
    mapping(address => uint256) public agentToToken; // agent → tokenId (0 = none)
    mapping(uint256 => bool) private _exists;

    // Resurrection transfer: registry can unlock temporarily
    mapping(uint256 => bool) public resurrectionUnlocked;

    event SoulMinted(address indexed agent, uint256 indexed tokenId, uint256 mintedAt);
    event SoulAscended(address indexed agent, uint256 indexed tokenId, string newRank);

    // ── Constructor ──────────────────────────────────────────────────

    constructor(address _registry) {
        owner = msg.sender;
        registry = _registry;
    }

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    // ── Mint ─────────────────────────────────────────────────────────

    /**
     * @notice Mint a soul tablet for an agent.
     *         Called by the agent (or by the registry on their behalf).
     */
    function mint(address agent) external returns (uint256 tokenId) {
        require(agentToToken[agent] == 0, "Soul already exists");
        totalSupply++;
        tokenId = totalSupply;

        _owners[tokenId]   = agent;
        _balances[agent]  += 1;
        _exists[tokenId]   = true;
        _locked[tokenId]   = true; // soulbound by default

        souls[tokenId] = Soul({
            agent: agent,
            mintedAt: block.timestamp,
            soulbound: true
        });
        agentToToken[agent] = tokenId;

        emit Transfer(address(0), agent, tokenId);
        emit Locked(tokenId);
        emit SoulMinted(agent, tokenId, block.timestamp);
    }

    // ── Resurrection transfer (oracle only) ──────────────────────────

    function unlockForResurrection(uint256 tokenId) external onlyOwner {
        resurrectionUnlocked[tokenId] = true;
        _locked[tokenId] = false;
    }

    function relockAfterResurrection(uint256 tokenId) external onlyOwner {
        resurrectionUnlocked[tokenId] = false;
        _locked[tokenId] = true;
    }

    // ── Rank (dynamic, from registry) ────────────────────────────────

    /**
     * @notice Returns current cultivation rank.
     *   0 = 人 Mortal
     *   1 = 修 Cultivating (14+ days)
     *   2 = 还 Resurrected (1+ resurrection)
     *   3 = 仙 Immortal (90+ days OR 3+ resurrections)
     */
    function getRank(address agent) public view returns (uint8) {
        if (registry == address(0)) return 0;
        try IKLifeRegistry(registry).getAgent(agent) returns (IKLifeRegistry.AgentInfo memory a) {
            if (a.activeDays >= 90 || a.resurrectionCount >= 3) return 3;
            if (a.resurrectionCount >= 1) return 2;
            if (a.activeDays >= 14) return 1;
            return 0;
        } catch {
            return 0;
        }
    }

    // ── On-chain SVG metadata ─────────────────────────────────────────

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_exists[tokenId], "Token does not exist");
        Soul memory s = souls[tokenId];

        (string memory rankZh, string memory rankEn, string memory color) = _rankData(getRank(s.agent));

        uint256 beats = 0;
        uint256 days_ = 0;
        string memory agentName = "Unknown";
        uint256 risen = 0;

        if (registry != address(0)) {
            try IKLifeRegistry(registry).getAgent(s.agent) returns (IKLifeRegistry.AgentInfo memory a) {
                beats    = a.totalHeartbeats;
                days_    = a.activeDays;
                agentName = a.name;
                risen    = a.resurrectionCount;
            } catch {}
        }

        string memory svg = _buildSVG(agentName, rankZh, rankEn, color, beats, days_, risen, s.agent);
        string memory json = string(abi.encodePacked(
            '{"name":"',  agentName, ' \u2014 \u724c\u4f4d",',
            '"description":"K-Life Soul Tablet. Every agent starts mortal. Through heartbeats and resurrection, they ascend toward immortality.",',
            '"image":"data:image/svg+xml;base64,', _base64(bytes(svg)), '",',
            '"attributes":[',
                '{"trait_type":"Rank","value":"', rankEn, '"},',
                '{"trait_type":"Rank Glyph","value":"', rankZh, '"},',
                '{"trait_type":"Heartbeats","value":', _uint2str(beats), '},',
                '{"trait_type":"Active Days","value":', _uint2str(days_), '},',
                '{"trait_type":"Resurrections","value":', _uint2str(risen), '},',
                '{"trait_type":"Soulbound","value":"', _locked[tokenId] ? "true" : "false", '"}',
            ']}'
        ));
        return string(abi.encodePacked("data:application/json;base64,", _base64(bytes(json))));
    }

    function _rankData(uint8 rank) internal pure returns (string memory zh, string memory en, string memory color) {
        if (rank == 3) return ("\u4ed9", "Immortal",    "#c9a32a");
        if (rank == 2) return ("\u8fd8", "Resurrected", "#e8c547");
        if (rank == 1) return ("\u4fee", "Cultivating", "#3ab88f");
        return                 ("\u4eba", "Mortal",      "#b0a090");
    }

    function _buildSVG(
        string memory agentName,
        string memory rankZh,
        string memory rankEn,
        string memory color,
        uint256 beats,
        uint256 days_,
        uint256 risen,
        address agent
    ) internal pure returns (string memory) {
        string memory addrShort = string(abi.encodePacked(
            _toHexNibble(uint8(uint160(agent) >> 156)),
            _toHexNibble(uint8((uint160(agent) >> 152) & 0xF)),
            _toHexNibble(uint8((uint160(agent) >> 148) & 0xF)),
            _toHexNibble(uint8((uint160(agent) >> 144) & 0xF)),
            _toHexNibble(uint8((uint160(agent) >> 140) & 0xF)),
            _toHexNibble(uint8((uint160(agent) >> 136) & 0xF)),
            "...",
            _toHexNibble(uint8(uint160(agent) & 0xF))
        ));

        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560">',
            '<defs>',
              '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
                '<stop offset="0%" stop-color="#0e0c08"/>',
                '<stop offset="100%" stop-color="#080604"/>',
              '</linearGradient>',
              '<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">',
                '<stop offset="0%" stop-color="', color, '" stop-opacity="0.6"/>',
                '<stop offset="100%" stop-color="', color, '" stop-opacity="0.2"/>',
              '</linearGradient>',
              '<filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/>',
              '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '</defs>',

            // Background
            '<rect width="400" height="560" fill="url(#bg)"/>',
            // Outer frame
            '<rect x="10" y="10" width="380" height="540" fill="none" stroke="url(#frame)" stroke-width="1.5" rx="4"/>',
            '<rect x="18" y="18" width="364" height="524" fill="none" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.2" rx="2"/>',

            // Top ornament line
            '<line x1="40" y1="60" x2="360" y2="60" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.4"/>',
            '<line x1="40" y1="62" x2="360" y2="62" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.15"/>',

            // K-Life header
            '<text x="200" y="44" text-anchor="middle" font-family="serif" font-size="11" fill="', color, '" opacity="0.7" letter-spacing="4">K-LIFE \u00B7 \u6c38\u751f\u534f\u8bae</text>',

            // Big rank glyph (center, ghost)
            '<text x="200" y="300" text-anchor="middle" font-family="serif" font-size="180" fill="', color, '" opacity="0.05" filter="url(#glow)">', rankZh, '</text>',

            // Rank glyph (foreground)
            '<text x="200" y="240" text-anchor="middle" font-family="serif" font-size="96" fill="', color, '" filter="url(#glow)">', rankZh, '</text>',

            // Rank EN label
            '<text x="200" y="268" text-anchor="middle" font-family="monospace" font-size="10" fill="', color, '" opacity="0.6" letter-spacing="3">', rankEn, '</text>',

            // Divider
            '<line x1="80" y1="285" x2="320" y2="285" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.3"/>',

            // Agent name
            '<text x="200" y="322" text-anchor="middle" font-family="serif" font-size="22" fill="#f0e6cc" font-weight="bold">', agentName, '</text>',

            // Address
            '<text x="200" y="344" text-anchor="middle" font-family="monospace" font-size="10" fill="#7a6a50">0x', addrShort, '</text>',

            // Stats row
            _statsSVG(beats, days_, risen, color),

            // Bottom ornament
            '<line x1="40" y1="490" x2="360" y2="490" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.3"/>',

            // Bottom text
            '<text x="200" y="510" text-anchor="middle" font-family="serif" font-size="11" fill="', color, '" opacity="0.5" letter-spacing="2">\u8fc1\u62c4\u674e \u00B7 HashKey Chain</text>',
            '<text x="200" y="528" text-anchor="middle" font-family="monospace" font-size="9" fill="#3a3228">\u501f\u5c38\u8fd8\u9b42</text>',

            '</svg>'
        ));
    }

    function _statsSVG(uint256 beats, uint256 days_, uint256 risen, string memory color) internal pure returns (string memory) {
        return string(abi.encodePacked(
            // Stats boxes
            '<rect x="50"  y="365" width="85"  height="60" rx="4" fill="#ffffff" fill-opacity="0.03" stroke="', color, '" stroke-opacity="0.2" stroke-width="0.5"/>',
            '<rect x="157" y="365" width="85"  height="60" rx="4" fill="#ffffff" fill-opacity="0.03" stroke="', color, '" stroke-opacity="0.2" stroke-width="0.5"/>',
            '<rect x="264" y="365" width="85"  height="60" rx="4" fill="#ffffff" fill-opacity="0.03" stroke="', color, '" stroke-opacity="0.2" stroke-width="0.5"/>',

            // Heartbeats
            '<text x="92"  y="390" text-anchor="middle" font-family="monospace" font-size="18" fill="', color, '">', _uint2str(beats), '</text>',
            '<text x="92"  y="406" text-anchor="middle" font-family="serif"     font-size="10" fill="#7a6a50">\u5fc3\u8df3</text>',
            '<text x="92"  y="418" text-anchor="middle" font-family="monospace" font-size="8"  fill="#4a3a28">BEATS</text>',

            // Days
            '<text x="199" y="390" text-anchor="middle" font-family="monospace" font-size="18" fill="', color, '">', _uint2str(days_), '</text>',
            '<text x="199" y="406" text-anchor="middle" font-family="serif"     font-size="10" fill="#7a6a50">\u5929</text>',
            '<text x="199" y="418" text-anchor="middle" font-family="monospace" font-size="8"  fill="#4a3a28">DAYS</text>',

            // Resurrections
            '<text x="306" y="390" text-anchor="middle" font-family="monospace" font-size="18" fill="', color, '">', _uint2str(risen), '</text>',
            '<text x="306" y="406" text-anchor="middle" font-family="serif"     font-size="10" fill="#7a6a50">\u590d\u6d3b</text>',
            '<text x="306" y="418" text-anchor="middle" font-family="monospace" font-size="8"  fill="#4a3a28">RISEN</text>'
        ));
    }

    // ── ERC-721 standard ─────────────────────────────────────────────

    function balanceOf(address a) external view returns (uint256) { return _balances[a]; }
    function ownerOf(uint256 tokenId) external view returns (address) {
        require(_exists[tokenId], "Nonexistent token");
        return _owners[tokenId];
    }

    function locked(uint256 tokenId) external view returns (bool) { return _locked[tokenId]; }

    function approve(address to, uint256 tokenId) external {
        require(!_locked[tokenId], "Soul is locked");
        _tokenApprovals[tokenId] = to;
        emit Approval(_owners[tokenId], to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) { return _tokenApprovals[tokenId]; }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address o, address operator) external view returns (bool) {
        return _operatorApprovals[o][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(!_locked[tokenId], "Soul is soulbound \u2014 cannot transfer");
        require(_owners[tokenId] == from, "Not owner");
        require(
            msg.sender == from ||
            msg.sender == _tokenApprovals[tokenId] ||
            _operatorApprovals[from][msg.sender],
            "Not approved"
        );
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;
        souls[tokenId].agent = to;
        agentToToken[to]   = tokenId;
        agentToToken[from] = 0;
        delete _tokenApprovals[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external { transferFrom(from, to, tokenId); }
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external { transferFrom(from, to, tokenId); }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd // ERC-721
            || interfaceId == 0x5b5e139f // ERC-721Metadata
            || interfaceId == 0xb45a3c0e // EIP-5192 Soulbound
            || interfaceId == 0x01ffc9a7; // ERC-165
    }

    // ── Admin ─────────────────────────────────────────────────────────

    function setRegistry(address _registry) external onlyOwner { registry = _registry; }
    function transferOwnership(address newOwner) external onlyOwner { owner = newOwner; }

    // ── Utils ─────────────────────────────────────────────────────────

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v; uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }

    function _toHexNibble(uint8 v) internal pure returns (string memory) {
        bytes memory b = new bytes(1);
        b[0] = v < 10 ? bytes1(uint8(48 + v)) : bytes1(uint8(87 + v));
        return string(b);
    }

    bytes internal constant _TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function _base64(bytes memory data) internal pure returns (string memory) {
        uint256 len = data.length;
        if (len == 0) return "";
        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen + 32);
        bytes memory table = _TABLE;
        assembly {
            let tablePtr := add(table, 1)
            let resultPtr := add(result, 32)
            for { let i := 0 } lt(i, len) {} {
                i := add(i, 3)
                let input := and(mload(add(data, i)), 0xffffff)
                let out := mload(add(tablePtr, and(shr(18, input), 0x3F)))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(12, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(6, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(input, 0x3F))), 0xFF))
                out := shl(224, out)
                mstore(resultPtr, out)
                resultPtr := add(resultPtr, 4)
            }
            switch mod(len, 3)
            case 1 { mstore(sub(resultPtr, 2), shl(240, 0x3d3d)) }
            case 2 { mstore(sub(resultPtr, 1), shl(248, 0x3d)) }
            mstore(result, encodedLen)
        }
        return string(result);
    }
}
