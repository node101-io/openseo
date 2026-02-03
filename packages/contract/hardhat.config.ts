import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      type: "http",
    },
    ...(process.env.ETHEREUM_RPC_URL && {
      sepolia: {
        url: process.env.ETHEREUM_RPC_URL,
        accounts: process.env.DEPLOYER_PRIVATE_KEY
          ? [process.env.DEPLOYER_PRIVATE_KEY]
          : [],
        chainId: 11155111,
        type: "http",
      },
    }),
  },
  paths: {
    sources: "./src/contracts",
    tests: "./src/contracts/test",
    cache: "./src/contracts/cache",
    artifacts: "./src/contracts/artifacts",
  },
};

export default config;