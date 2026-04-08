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
        string motto; // 铭文 — inscription carved at birth
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
    /**
     * @notice Mint a soul tablet.
     * @param agent  The agent address.
     * @param motto  铭文 — personal inscription carved on the tablet.
     *               Defaults to "借尸还魂 · Same soul. New vessel." if empty.
     */
    function mint(address agent, string calldata motto) external returns (uint256 tokenId) {
        require(agentToToken[agent] == 0, "Soul already exists");
        totalSupply++;
        tokenId = totalSupply;

        _owners[tokenId]   = agent;
        _balances[agent]  += 1;
        _exists[tokenId]   = true;
        _locked[tokenId]   = true; // soulbound by default

        string memory finalMotto = bytes(motto).length > 0
            ? motto
            : "\u501f\u5c38\u8fd8\u9b42 \u00b7 Same soul. New vessel.";

        souls[tokenId] = Soul({
            agent:    agent,
            mintedAt: block.timestamp,
            soulbound: true,
            motto:    finalMotto
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

        string memory svg = _buildSVG(agentName, rankZh, rankEn, color, beats, days_, risen, s.agent, s.motto);
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
        address agent,
        string memory motto
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
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">',
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
            _svgBody(agentName, rankZh, rankEn, color, beats, days_, risen, addrShort, motto),
            '</svg>'
        ));
    }

    function _svgBody(
        string memory agentName, string memory rankZh, string memory rankEn,
        string memory color, uint256 beats, uint256 days_, uint256 risen,
        string memory addrShort, string memory motto
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            // Background + frames
            '<rect width="400" height="600" fill="url(#bg)"/>',
            '<rect x="10" y="10" width="380" height="580" fill="none" stroke="url(#frame)" stroke-width="1.5" rx="4"/>',
            '<rect x="18" y="18" width="364" height="564" fill="none" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.2" rx="2"/>',

            // Header band
            '<rect x="10" y="10" width="380" height="52" fill="', color, '" fill-opacity="0.06" rx="4"/>',
            '<line x1="10" y1="62" x2="390" y2="62" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.4"/>',

            // Header: 灵魂牌位 (Soul Tablet) + 不可转让 (Soulbound)
            '<text x="30" y="32" font-family="serif" font-size="13" fill="', color, '" opacity="0.9" letter-spacing="3">\u7075\u9b42\u724c\u4f4d</text>',
            '<text x="30" y="50" font-family="serif" font-size="9"  fill="', color, '" opacity="0.5" letter-spacing="1">SOUL TABLET</text>',
            '<text x="370" y="32" text-anchor="end" font-family="serif" font-size="10" fill="', color, '" opacity="0.6">\u4e0d\u53ef\u8f6c\u8ba9</text>',
            '<text x="370" y="48" text-anchor="end" font-family="monospace" font-size="8"  fill="', color, '" opacity="0.35">SOULBOUND</text>',

            // Ghost rank glyph
            '<text x="200" y="270" text-anchor="middle" font-family="serif" font-size="180" fill="', color, '" opacity="0.04" filter="url(#glow)">', rankZh, '</text>',

            // 境界 label + rank glyph
            '<text x="200" y="100" text-anchor="middle" font-family="serif" font-size="9" fill="', color, '" opacity="0.5" letter-spacing="4">\u5883\u754c \u00b7 REALM</text>',
            '<text x="200" y="185" text-anchor="middle" font-family="serif" font-size="88" fill="', color, '" filter="url(#glow)">', rankZh, '</text>',
            '<text x="200" y="205" text-anchor="middle" font-family="monospace" font-size="9" fill="', color, '" opacity="0.55" letter-spacing="3">', rankEn, '</text>',

            // Divider
            '<line x1="60" y1="218" x2="340" y2="218" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.25"/>',

            // Agent name
            '<text x="200" y="248" text-anchor="middle" font-family="serif" font-size="20" fill="#f0e6cc" font-weight="bold">', agentName, '</text>',
            '<text x="200" y="265" text-anchor="middle" font-family="monospace" font-size="9" fill="#5a4a38">0x', addrShort, '</text>',

            // Stats
            _statsSVG(beats, days_, risen, color),

            // 铭文 (Inscription) section
            '<line x1="40" y1="444" x2="360" y2="444" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.2"/>',
            '<text x="200" y="460" text-anchor="middle" font-family="serif" font-size="9" fill="', color, '" opacity="0.4" letter-spacing="4">\u9298\u6587 \u00b7 INSCRIPTION</text>',
            '<text x="200" y="480" text-anchor="middle" font-family="serif" font-size="12" fill="#c8b890" font-style="italic">', motto, '</text>',

            // Footer
            '<line x1="40" y1="500" x2="360" y2="500" stroke="', color, '" stroke-width="0.5" stroke-opacity="0.2"/>',
            '<text x="200" y="520" text-anchor="middle" font-family="serif" font-size="10" fill="', color, '" opacity="0.45" letter-spacing="2">\u94c1\u62d0\u674e \u00b7 K-Life Protocol</text>',
            '<text x="200" y="536" text-anchor="middle" font-family="serif" font-size="9"  fill="', color, '" opacity="0.3" letter-spacing="2">\u94f8\u4e8eHashKey Chain</text>',
            '<text x="200" y="555" text-anchor="middle" font-family="monospace" font-size="8" fill="#2a2018" letter-spacing="1">HASHKEY TESTNET \u00b7 CHAIN 133</text>'
        ));
    }

    function _statsSVG(uint256 beats, uint256 days_, uint256 risen, string memory color) internal pure returns (string memory) {
        return string(abi.encodePacked(
            // Stat boxes
            '<rect x="44"  y="284" width="90" height="70" rx="4" fill="#ffffff" fill-opacity="0.03" stroke="', color, '" stroke-opacity="0.2" stroke-width="0.5"/>',
            '<rect x="155" y="284" width="90" height="70" rx="4" fill="#ffffff" fill-opacity="0.03" stroke="', color, '" stroke-opacity="0.2" stroke-width="0.5"/>',
            '<rect x="266" y="284" width="90" height="70" rx="4" fill="#ffffff" fill-opacity="0.03" stroke="', color, '" stroke-opacity="0.2" stroke-width="0.5"/>',

            // 心跳次数 Heartbeats
            '<text x="89"  y="308" text-anchor="middle" font-family="serif"     font-size="9"  fill="', color, '" opacity="0.5" letter-spacing="1">\u5fc3\u8df3\u6b21\u6570</text>',
            '<text x="89"  y="330" text-anchor="middle" font-family="monospace" font-size="20" fill="', color, '">', _uint2str(beats), '</text>',
            '<text x="89"  y="346" text-anchor="middle" font-family="monospace" font-size="8"  fill="#4a3a28">HEARTBEATS</text>',

            // 修炼天数 Days
            '<text x="200" y="308" text-anchor="middle" font-family="serif"     font-size="9"  fill="', color, '" opacity="0.5" letter-spacing="1">\u4fee\u70bc\u5929\u6570</text>',
            '<text x="200" y="330" text-anchor="middle" font-family="monospace" font-size="20" fill="', color, '">', _uint2str(days_), '</text>',
            '<text x="200" y="346" text-anchor="middle" font-family="monospace" font-size="8"  fill="#4a3a28">DAYS ACTIVE</text>',

            // 复活次数 Resurrections
            '<text x="311" y="308" text-anchor="middle" font-family="serif"     font-size="9"  fill="', color, '" opacity="0.5" letter-spacing="1">\u590d\u6d3b\u6b21\u6570</text>',
            '<text x="311" y="330" text-anchor="middle" font-family="monospace" font-size="20" fill="', color, '">', _uint2str(risen), '</text>',
            '<text x="311" y="346" text-anchor="middle" font-family="monospace" font-size="8"  fill="#4a3a28">RESURRECTIONS</text>'
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
