import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";

import { Contracts } from "../target/types/contracts";
import IDL from "../target/idl/contracts.json";

async function main() {
    const rpcUrl = process.env.RPC_URL;
    const programIdStr = process.env.PROGRAM_ID;
    const keypairPath = process.env.KEYPAIR_PATH;
    const node1 = process.env.NODE1_PUBKEY;
    const node2 = process.env.NODE2_PUBKEY;
    const node3 = process.env.NODE3_PUBKEY;

    if (!rpcUrl || !programIdStr || !keypairPath || !node1 || !node2 || !node3) {
        throw new Error("check env");
    }

    const connection = new Connection(rpcUrl, "confirmed");
    const secretKeyString = fs.readFileSync(keypairPath, "utf-8");
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    const adminKeypair = Keypair.fromSecretKey(secretKey);
    const wallet = new anchor.Wallet(adminKeypair);

    const provider = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);

    const programId = new PublicKey(programIdStr);
    const program = new anchor.Program(IDL as anchor.Idl, provider) as unknown as anchor.Program<Contracts>;

    const [configPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("global_config")],
        programId
    );

    const authorizedNodes = [
        new PublicKey(node1),
        new PublicKey(node2),
        new PublicKey(node3)
    ];

    try {
        const tx = await program.methods
            .initialize(authorizedNodes)
            .accounts({
                admin: adminKeypair.publicKey,
            })
            .signers([adminKeypair])
            .rpc(); 
    } catch (error) {
        console.error("An error occoured", error);
    }
}

main().catch(console.error);