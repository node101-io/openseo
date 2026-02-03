import http from 'http';
import express from 'express';
import { NodeService } from '../index.js';
import * as dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
const FILECOIN_URL = 'https://openseo-filecoin.openseo.workers.dev';
const isLocalhost = RPC_URL.includes('localhost') || RPC_URL.includes('127.0.0.1');

const HARDHAT_ACCOUNTS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
];

const DEFAULT_HTTP_PORT = 3006;

const NODES = [
  { name: 'Node1', index: 1 },
  { name: 'Node2', index: 2 },
  { name: 'Node3', index: 3 },
];

function getPrivateKeyForNode(nodeIndex: number): string {
  if (isLocalhost) {
    return HARDHAT_ACCOUNTS[Math.min(nodeIndex, HARDHAT_ACCOUNTS.length - 1)];
  }
  return '';
}

async function main() {
  const app = express();
  const httpPort = Number(process.env.ORACLE_HTTP_PORT || DEFAULT_HTTP_PORT);
  app.use(express.json());

  const services: NodeService[] = [];

  for (const node of NODES) {
    const privateKey = getPrivateKeyForNode(node.index);
    const service = new NodeService(
      node.name,
      privateKey,
      CONTRACT_ADDRESS,
      RPC_URL,
      FILECOIN_URL
    );
    services.push(service);
  }

  app.get('/health', (_req, res) => {
    const status = services.map((s) => ({
      name: s.getNodeName(),
      address: s.getAddress(),
    }));
    res.json({ ok: true, mode: 'multi', nodes: status });
  });

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

  let started = 0;
  for (const service of services) {
    const ok = await service.initialize();
    if (ok) {
      await service.startEventListener();
      started++;
    }
  }

  console.log('[Runner] All nodes started from single entry point.');
}

main().catch(console.error);
