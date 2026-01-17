import express, { Request, Response } from 'express';
import { NodeService } from '../services/nodeService.js';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.NODE1_PORT || 3006;

app.use(express.json());

const FILECOIN_URL = process.env.FILECOIN_URL || 'http://localhost:3000';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
let NODE1_PRIVATE_KEY = process.env.NODE1_PRIVATE_KEY || '';
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
const isLocalhost = RPC_URL.includes("localhost") || RPC_URL.includes("127.0.0.1");

if (!NODE1_PRIVATE_KEY && isLocalhost) {
    console.log('[Node1] No private key provided, using Hardhat node test account #1');
    NODE1_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
}

// node service
const nodeService = new NodeService(
    'Node1',
    NODE1_PRIVATE_KEY,
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
    console.log(`[Node1] Server running on port ${PORT}`);
    console.log(`[Node1] Waiting for verification requests...`);
});

export default app;