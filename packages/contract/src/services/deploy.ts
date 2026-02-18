import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const LOCALHOST_RPC = "http://127.0.0.1:8545";

const HARDHAT_KEYS = {
  DEPLOYER: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  NODE1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  NODE2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  NODE3: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
};

function toAddress(privateKey: string): string {
  const key = privateKey.trim().split("//")[0].trim();
  return new ethers.Wallet(key.startsWith("0x") ? key : "0x" + key).address;
}

export async function main() {
  const isLocalhost = process.env.HARDHAT_NETWORK === "localhost";
  const rpcUrl = isLocalhost ? LOCALHOST_RPC : (process.env.ETHEREUM_RPC_URL || LOCALHOST_RPC).trim();
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const deployerKey = isLocalhost
    ? HARDHAT_KEYS.DEPLOYER
    : (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  if (!deployerKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY required for non-localhost. Use deploy:localhost for local node.");
  }
  const deployer = new ethers.Wallet(deployerKey.startsWith("0x") ? deployerKey : "0x" + deployerKey, provider);

  const node1Key = isLocalhost ? HARDHAT_KEYS.NODE1 : (process.env.NODE1_PRIVATE_KEY || "").trim();
  const node2Key = isLocalhost ? HARDHAT_KEYS.NODE2 : (process.env.NODE2_PRIVATE_KEY || "").trim();
  const node3Key = isLocalhost ? HARDHAT_KEYS.NODE3 : (process.env.NODE3_PRIVATE_KEY || "").trim();
  if (!node1Key || !node2Key || !node3Key) {
    throw new Error("Set NODE1_PRIVATE_KEY, NODE2_PRIVATE_KEY, NODE3_PRIVATE_KEY (or use deploy:localhost).");
  }

  const nodeAddresses = [node1Key, node2Key, node3Key].map(toAddress);
  const artifactPath = path.join(
    process.cwd(),
    "src",
    "contracts",
    "artifacts",
    "src",
    "contracts",
    "OpenSEO.sol",
    "OpenSEO.json"
  );
  const { abi, bytecode } = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const contract = await new ethers.ContractFactory(abi, bytecode, deployer).deploy(nodeAddresses, {
    gasLimit: 5000000,
  });
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const code = await provider.getCode(contractAddress);
  if (!code || code === "0x" || code === "0x0") {
    console.error("Contract bytecode not found at", contractAddress, "- ensure the node is running and use deploy:localhost.");
    process.exit(1);
  }

  console.log("\nDeploying OpenSEO contract...");
  console.log("Deployer:", deployer.address);
  console.log("Nodes:", nodeAddresses.join(", "));
  console.log("\nCONTRACT_ADDRESS=" + contractAddress);

  const deploymentPath = path.join(process.cwd(), "openseo.json");
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        contractAddress,
        abi,
        network: isLocalhost ? "localhost" : "production",
        authorizedNodes: { node1: nodeAddresses[0], node2: nodeAddresses[1], node3: nodeAddresses[2] },
      },
      null,
      2
    )
  );
}

const isMain = process.argv[1]?.includes("deploy") || process.argv[1]?.includes("hardhat");
if (isMain) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
