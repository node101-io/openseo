import { PublicKey, Connection } from "@solana/web3.js";
import { sha256 } from "js-sha256";
import { Program, AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { Contracts } from "../target/types/contracts.js";
import IDL from "../target/idl/contracts.json";

export type { Contracts } from '../target/types/contracts.js';

const raw = (process.env.PROGRAM_ID || "Ffac4PLvjZPLQpdRwN52sgeJrApWganmiQTaoPaGxx8u").trim();
export const OPENSEO_PROGRAM_ID = new PublicKey(raw || "");
export const getProgramId = OPENSEO_PROGRAM_ID;

export function getIDL(): Record<string, unknown> {
  return IDL as Record<string, unknown>;
}

export function getConfigPda(programId: PublicKey = OPENSEO_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    programId
  );
}

export function getRequestPda(
  cidHash: number[] | Uint8Array, 
  programId: PublicKey = OPENSEO_PROGRAM_ID
): [PublicKey, number] {
  const buf = Buffer.from(cidHash);        
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from("request"), buf],
    programId
  );
}

export function cidToHash(cid: string): number[] {
  return Array.from(sha256.array(cid));
}

export function createProgram(connection: Connection, wallet: Wallet): Program<Contracts> {
  const provider = new AnchorProvider(connection, wallet, {});
  return new Program<Contracts>(getIDL() as any, provider);
}