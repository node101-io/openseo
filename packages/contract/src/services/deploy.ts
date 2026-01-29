import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// Hardhat default test account private keys
const HARDHAT_KEYS = {
  NODE1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account #1
  NODE2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Account #2
  NODE3: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // Account #3
};

// Private key'den adres derive et
export function getAddressFromPrivateKey(privateKey: string): string {
  let cleanKey = privateKey.trim().split('//')[0].trim();
  if (!cleanKey.startsWith('0x')) {
    cleanKey = '0x' + cleanKey;
  }
  const wallet = new ethers.Wallet(cleanKey);
  return wallet.address;
}

export async function main() {
  const rpcUrl = (process.env.ETHEREUM_RPC_URL || "").trim();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const isLocalhost = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1");
  
  const deployerPrivateKey = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
  const deployer = new ethers.Wallet(deployerPrivateKey, provider);

  const node1PrivateKey = (process.env.NODE1_PRIVATE_KEY || "").trim() || (isLocalhost ? HARDHAT_KEYS.NODE1 : "");
  const node2PrivateKey = (process.env.NODE2_PRIVATE_KEY || "").trim() || (isLocalhost ? HARDHAT_KEYS.NODE2 : "");
  const node3PrivateKey = (process.env.NODE3_PRIVATE_KEY || "").trim() || (isLocalhost ? HARDHAT_KEYS.NODE3 : "");

  if (!node1PrivateKey || !node2PrivateKey || !node3PrivateKey) {
    throw new Error("Node private keys required! Set NODE1_PRIVATE_KEY, NODE2_PRIVATE_KEY, NODE3_PRIVATE_KEY in .env");
  }

  const node1Address = getAddressFromPrivateKey(node1PrivateKey);
  const node2Address = getAddressFromPrivateKey(node2PrivateKey);
  const node3Address = getAddressFromPrivateKey(node3PrivateKey);

  console.log(`Node addresses derived from private keys:`);
  console.log(`  Node1: ${node1Address}`);
  console.log(`  Node2: ${node2Address}`);
  console.log(`  Node3: ${node3Address}`);

  const artifactPath = path.join(process.cwd(), "src", "contracts", "artifacts", "src", "contracts", "OpenSEO.sol", "OpenSEO.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const OpenSEO = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    deployer
  );

  const nodeAddresses = [node1Address, node2Address, node3Address];
  
  console.log(`\nDeploying OpenSEO contract...`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Authorized nodes: ${nodeAddresses.join(", ")}`);
  
  const openSEO = await OpenSEO.deploy(nodeAddresses, {
    gasLimit: 5000000
  });
  
  await openSEO.waitForDeployment();
  
  const contractAddress = await openSEO.getAddress();
  console.log(`\nCONTRACT_ADDRESS=${contractAddress}`);

  const deploymentInfo = {
    contractAddress,
    abi: artifact.abi,
    network: isLocalhost ? "localhost" : "production",
    authorizedNodes: {
      node1: node1Address,
      node2: node2Address,
      node3: node3Address
    }
  };

  const deploymentPath = path.join(process.cwd(), "openseo.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);
}

// Only run when executed directly (not when imported)
// Check if this file is being run directly by Hardhat or node
const isMainModule = process.argv[1]?.includes('deploy.ts') || process.argv[1]?.includes('hardhat');

if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
