require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { DEPLOYER_PRIVATE_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    luksoTestnet: {
      url: "https://explorer.execution.testnet.lukso.network/api/eth-rpc",
      chainId: 4201,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : []
    },
    luksoMainnet: {
      url: "https://rpc.mainnet.lukso.network",
      chainId: 42,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: {
      luksoTestnet: "no-api-key-needed",
      luksoMainnet: "no-api-key-needed"
    },
    customChains: [
      {
        network: "luksoTestnet",
        chainId: 4201,
        urls: {
          apiURL: "https://explorer.execution.testnet.lukso.network/api",
          browserURL: "https://explorer.execution.testnet.lukso.network"
        }
      },
      {
        network: "luksoMainnet",
        chainId: 42,
        urls: {
          apiURL: "https://explorer.execution.mainnet.lukso.network/api",
          browserURL: "https://explorer.execution.mainnet.lukso.network"
        }
      }
    ]
  }
};
