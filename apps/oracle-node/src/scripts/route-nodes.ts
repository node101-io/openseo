import http from "http";
import fs from "fs";
import path from "path";
import express from "express";
import { NodeService } from "../index.js";
import * as dotenv from "dotenv";

dotenv.config();

const PROGRAM_ID = process.env.PROGRAM_ID  || "";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const FILECOIN_URL = process.env.FILECOIN_URL || "https://openseo-filecoin.openseo.workers.dev";
const HTTP_PORT =  Number(process.env.ORACLE_HTTP_PORT || 3006);

const NODES = [
  { name: "Node1", index: 1 },
  { name: "Node2", index: 2 },
  { name: "Node3", index: 3 },
];

function loadPrivateKeyForNode(idx: number): string {
  const defaults = [
    path.resolve(process.cwd(), `packages/contracts/pubkeys/node${idx}.json`),
    path.resolve(process.cwd(), `../../packages/contracts/pubkeys/node${idx}.json`),
  ];
  for (const p of defaults) if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  return "";
}

async function main() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", nodes: services.length }));
  const server = http.createServer(app);
  server.once("error", (err: NodeJS.ErrnoException) => {
    console.error(`[Runner] Sunucu hatası (${err.code}):`, err.message);
    process.exit(1);
  });

  const services: NodeService[] = [];
  for (const n of NODES) {
    const key = loadPrivateKeyForNode(n.index);
    if (!key) {
      console.warn(`[Runner] Key not found for${n.name}`);
      continue;
    }
    const svc = new NodeService(n.name, key, PROGRAM_ID, RPC_URL, FILECOIN_URL);
    const ok = await svc.initialize();
    if (ok) {
      await svc.startEventListener();
      services.push(svc);
      console.log(`[Runner] ${n.name} starting.`);
    } else {
      console.warn(`[Runner] ${n.name} not initialized`);
    }
  }
}

main().catch((e) => {
  console.error("[Runner] Error:", e);
  process.exit(1);
});