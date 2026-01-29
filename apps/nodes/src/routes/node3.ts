import express from 'express';
import { NodeService } from "../index.js";
import * as dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.NODE3_PORT || '';
app.use(express.json());

const FILECOIN_URL = process.env.FILECOIN_URL || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
let NODE3_PRIVATE_KEY = (process.env.NODE3_PRIVATE_KEY || '').trim();
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
});

export default app;