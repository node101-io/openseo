import express from 'express';
import { NodeService } from "../index.js";
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.NODE2_PORT || '';

app.use(express.json());

const FILECOIN_URL = process.env.FILECOIN_URL || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
let NODE2_PRIVATE_KEY = (process.env.NODE2_PRIVATE_KEY || '').trim();
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
const isLocalhost = RPC_URL.includes("localhost") || RPC_URL.includes("127.0.0.1");

if (!NODE2_PRIVATE_KEY && isLocalhost) {
    console.log('[Node2] No private key provided, using Hardhat node test account #2');
    NODE2_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
}

// node service
const nodeService = new NodeService(
    'Node2',
    NODE2_PRIVATE_KEY,
    CONTRACT_ADDRESS,
    RPC_URL,
    FILECOIN_URL
);

async function startNode() {
    const initialized = await nodeService.initialize();
    if (initialized) {
        await nodeService.startEventListener();
    }
}

startNode().catch(console.error);
app.listen(PORT, () => {
    console.log(`[Node2] Server running on port ${PORT}`);
});

export default app;
