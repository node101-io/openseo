import express, { Request, Response } from 'express';
import { NodeService } from '../services/nodeService.js';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.NODE3_PORT || 3003;
app.use(express.json());

const FILECOIN_URL = process.env.FILECOIN_URL || 'http://localhost:3000';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
let NODE3_PRIVATE_KEY = process.env.NODE3_PRIVATE_KEY || '';
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
const isLocalhost = RPC_URL.includes("localhost") || RPC_URL.includes("127.0.0.1");

if (!NODE3_PRIVATE_KEY && isLocalhost) {
    console.log('[Node3] No private key provided, using hardhat node test account #3');
    NODE3_PRIVATE_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
}
    
const nodeService = new NodeService(
    'Node3',
    NODE3_PRIVATE_KEY,
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
    console.log(`[Node3] Server running on port ${PORT}`);
    console.log(`[Node3] Waiting for verification requests...`);
});

export default app;