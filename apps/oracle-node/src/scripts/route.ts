import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { NodeService } from '../index.js';
import * as dotenv from 'dotenv';

dotenv.config();

const PROGRAM_ID = process.env.PROGRAM_ID || '';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const FILECOIN_URL = process.env.FILECOIN_URL || '';

function loadNodePrivateKey(): string {
  const raw = process.env.NODE_PRIVATE_KEY ?? process.env.NODE1_PRIVATE_KEY;
  if (raw && raw.trim() !== '') return raw;
  const keypairPath = process.env.KEYPAIR_PATH || process.env.NODE_KEYPAIR_PATH;
  if (keypairPath) {
    try {
      const resolved = keypairPath.startsWith('~')
        ? path.join(process.env.HOME || '', keypairPath.slice(1))
        : path.isAbsolute(keypairPath)
          ? keypairPath
          : path.resolve(process.cwd(), keypairPath);
      return fs.readFileSync(resolved, 'utf-8');
    } catch (e) {
      console.error('[Runner] Failed to read KEYPAIR_PATH:', (e as Error).message);
    }
  }
  const defaultPath = path.resolve(process.cwd(), 'packages/contracts/pubkeys/node1.json');
  if (fs.existsSync(defaultPath)) {
    return fs.readFileSync(defaultPath, 'utf-8');
  }
  return '';
}

const nodePrivateKey = loadNodePrivateKey();
const DEFAULT_HTTP_PORT = 3006;

async function main() {
  const app = express();
  const httpPort = Number(process.env.ORACLE_HTTP_PORT || DEFAULT_HTTP_PORT);
  app.use(express.json());

  const nodeName = "PrimaryNode";
  const service = new NodeService(
    nodeName,
    nodePrivateKey,
    PROGRAM_ID,
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});