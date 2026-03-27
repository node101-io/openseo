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

export function splitCid(cid: string): { cid_part1: string, cid_part2: string } {
    return {
        cid_part1: cid.substring(0, 30),
        cid_part2: cid.substring(30)
    };
}

export function getRequestPda(
  cid_part1: string,
  cid_part2: string,
  programId: PublicKey = OPENSEO_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("request"),
      Buffer.from(cid_part1),
      Buffer.from(cid_part2)
    ],
    programId
  );
}

export function createProgram(connection: Connection, wallet: Wallet): Program<Contracts> {
  const provider = new AnchorProvider(connection, wallet, {});
  return new Program<Contracts>(getIDL() as any, provider);
}