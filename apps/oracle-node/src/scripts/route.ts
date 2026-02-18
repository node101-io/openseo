import http from 'http';
import express from 'express';
import { NodeService } from '../index.js';
import * as dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
const FILECOIN_URL = 'https://openseo-filecoin.openseo.workers.dev';
const DEFAULT_HTTP_PORT = 3006;
const HARDHAT_ACCOUNT ='0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function main() {
  const app = express();
  const httpPort = Number(process.env.ORACLE_HTTP_PORT || DEFAULT_HTTP_PORT);
  app.use(express.json());

  const privateKey = HARDHAT_ACCOUNT;
  const nodeName = "PrimaryNode";
  const service = new NodeService(
    nodeName,
    privateKey,
    CONTRACT_ADDRESS,
    RPC_URL,
    FILECOIN_URL
  );

  const server = http.createServer(app);
  server.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Runner] Port ${httpPort} is already in use.`);
    } else {
      console.error('[Runner] Server error:', err.message);
    }
    process.exit(1);
  });

  server.listen(httpPort, () => {
    console.log(`[Runner] HTTP server on port ${httpPort}`);
  });

  const ok = await service.initialize();
  if (ok) {
    await service.startEventListener();
    console.log(`[Runner] ${nodeName} started`);
  } else {
    console.error('[Runner] not started');
  }
}