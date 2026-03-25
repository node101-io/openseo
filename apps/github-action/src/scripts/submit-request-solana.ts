/// <reference types="node" />
import fs from "fs";
import path from "path";
import { Connection, Keypair, SystemProgram } from "@solana/web3.js";
import { BN, Wallet } from "@coral-xyz/anchor";
import {
  createProgram,
  getRequestPda,
  cidToHash,
} from "@openseo/contracts";
import { SOLANA_RPC_URL, KEYPAIR_PATH } from "./config";

export interface SubmitRequestResult {
  txHash: string;
  blockNumber: number;
}

function loadKeypair(): Keypair {
  let keypairPath = KEYPAIR_PATH;
  if (!keypairPath || keypairPath.trim() === "") {
    const defaultPath = path.resolve(process.cwd(), "packages/contracts/pubkeys/node1.json");
    const defaultFromApp = path.resolve(process.cwd(), "../../packages/contracts/pubkeys/node1.json");
    if (fs.existsSync(defaultPath)) keypairPath = defaultPath;
    else if (fs.existsSync(defaultFromApp)) keypairPath = defaultFromApp;
  }
  if (!keypairPath) {
    throw new Error("KEYPAIR_PATH is not set");
  }
  const resolvedPath = keypairPath.startsWith("~")
    ? path.join(process.env.HOME || "", keypairPath.slice(1))
    : path.isAbsolute(keypairPath)
      ? keypairPath
      : path.resolve(process.cwd(), keypairPath);
  const content = fs.readFileSync(resolvedPath, "utf-8");
  const secret = JSON.parse(content) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export async function submitRequestToSolana(cid: string, keywords: string[]): Promise<SubmitRequestResult> {
  const connection = new Connection(SOLANA_RPC_URL);
  const keypair = loadKeypair();
  const wallet = new Wallet(keypair);
  const program = createProgram(connection, wallet);
  const programId = program.programId;
  const cidHash = cidToHash(cid);
  const [requestPda] = getRequestPda(cidHash, programId);
  const paymentLamports = 10_000_000; // 0.01 SOL

  const sig = await program.methods
    .submitRequest(cidHash, cid, keywords, new BN(paymentLamports))
    .accounts({ 
      owner: keypair.publicKey,
    })
    .rpc();
  console.log("Transaction submitted", sig);
  const info = await connection.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  return {
    txHash: sig,
    blockNumber: info?.slot ?? 0,
  };
}

const PROOF_OUTPUT_FILE = "output/proof-output.json";
const CID_FILE = "output/cid.json";

async function main() {
  let cid = process.env.CID || process.argv[2];
  console.log("Using CID:", cid);
  if (!cid && fs.existsSync(CID_FILE)) {
    const data = JSON.parse(fs.readFileSync(CID_FILE, "utf-8"));
    cid = data?.cid;
  }
  let keywordsRaw: string | undefined = process.argv[3];
  if (!keywordsRaw) {
    keywordsRaw = process.env.TEST_KEYWORDS || process.env.KEYWORDS || undefined;
    if (!keywordsRaw && fs.existsSync(PROOF_OUTPUT_FILE)) {
      const proofData = JSON.parse(fs.readFileSync(PROOF_OUTPUT_FILE, "utf-8"));
      keywordsRaw = JSON.stringify(proofData.keywords || []);
    }
  }
  if (!cid || !keywordsRaw) {
    console.error("Usage: tsx submit-request-solana.ts <cid> '[\"keyword1\",\"keyword2\"]'");
    process.exit(1);
  }
  const keywords = JSON.parse(keywordsRaw!) as string[];
  if (!Array.isArray(keywords)) {
    console.error("keywords must be a JSON array");
    process.exit(1);
  }
  const result = await submitRequestToSolana(cid, keywords);
  console.log("RESULT:", JSON.stringify(result));
}

const run = process.argv[1]?.includes('submit-request-solana');
if (run) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
