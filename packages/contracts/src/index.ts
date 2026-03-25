/// <reference types="node" />
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PublicKey, Connection } from "@solana/web3.js";
import { sha256 } from "js-sha256";
import { Program, AnchorProvider, type Idl, type Wallet } from "@coral-xyz/anchor";
import { Contracts } from "../target/types/contracts.js";
export type { Contracts } from '../target/types/contracts.js';

const raw = (process.env.PROGRAM_ID || "9XuwazWLjoAaT3aqDa7jwd8zGJguwnWztvvJsQ3tPWtP").trim();
export const OPENSEO_PROGRAM_ID = new PublicKey(
  raw || ""
);
export const getProgramId = OPENSEO_PROGRAM_ID;

const IDL_FILENAME = "contracts.json";

function resolveIdlPath(): string {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "..", "..", "packages", "contracts", "target", "idl", IDL_FILENAME),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `IDL not found. Tried from cwd ${cwd}.`
  );
}

export function getIDL(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolveIdlPath(), "utf-8")) as Record<string, unknown>;
}

export function getConfigPda(programId: PublicKey = OPENSEO_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    programId
  );
}

export function getRequestPda(
  cidHash: Uint8Array | number[],
  programId: PublicKey = OPENSEO_PROGRAM_ID
): [PublicKey, number] {
  if (cidHash.length !== 32) throw new Error("cidHash must be 32 bytes");
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