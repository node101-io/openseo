/// <reference types="node" />
import * as dotenv from 'dotenv';
dotenv.config();

const FILECOIN_URL = process.env.FILECOIN_URL || 'https://openseo-filecoin.openseo.workers.dev';
const DA_URL = process.env.DA_URL || 'https://openseo-da.openseo.workers.dev';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

export function workerHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (WORKER_API_KEY) h['X-API-Key'] = WORKER_API_KEY;
    return h;
}

export { FILECOIN_URL, DA_URL };
export const PROGRAM_ID = process.env.PROGRAM_ID || "";
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "";
export const KEYPAIR_PATH = process.env.KEYPAIR_PATH;