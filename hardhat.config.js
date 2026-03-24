require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    "initia-testnet": {
      url: process.env.INITIA_TESTNET_RPC || "https://evm-rpc-testnet.initia.tech:8445",
      chainId: 11822,
      accounts: process.env.WALLET_PRIVATE_KEY ? [process.env.WALLET_PRIVATE_KEY] : [],
      timeout: 600000
    }
  }
};
