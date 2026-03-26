// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Mock ERC20 for testnet only
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    uint8 private _dec;

    constructor(string memory name, string memory symbol, uint8 dec)
        ERC20(name, symbol)
        Ownable(msg.sender)
    {
        _dec = dec;
        _mint(msg.sender, 1_000_000 * 10**dec); // 1M tokens to deployer
    }

    function decimals() public view override returns (uint8) { return _dec; }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
