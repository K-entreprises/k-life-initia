require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PK = process.env.WALLET_PRIVATE_KEY || "0x" + "0".repeat(64) // dummy if not set

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    // ── Polygon Amoy (testnet) ─────────────────────────────
    amoy: {
      url:      process.env.AMOY_RPC || "https://rpc-amoy.polygon.technology",
      chainId:  80002,
      accounts: [PK],
      timeout:  120000,
    },
    // ── Polygon mainnet ────────────────────────────────────
    polygon: {
      url:      process.env.POLYGON_RPC || "https://polygon-rpc.com",
      chainId:  137,
      accounts: [PK],
      timeout:  120000,
      gasPrice: "auto",
    },
    // ── Hardhat local ──────────────────────────────────────
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      polygon:     process.env.POLYGONSCAN_API_KEY || "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    },
    customChains: [{
      network:   "polygonAmoy",
      chainId:   80002,
      urls: {
        apiURL:     "https://api-amoy.polygonscan.com/api",
        browserURL: "https://amoy.polygonscan.com",
      }
    }]
  },
  gasReporter: {
    enabled:  process.env.REPORT_GAS === "true",
    currency: "USD",
  },
}

// Sourcify support
module.exports.sourcify = { enabled: true }
