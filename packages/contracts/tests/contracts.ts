import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Contracts } from "../target/types/contracts"; 
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { sha256 } from "js-sha256";

describe("OpenSEO Contracts Test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Contracts as Program<Contracts>;

  const nodeA = Keypair.generate();
  const nodeB = Keypair.generate();
  const nodeC = Keypair.generate();

  const cid = "QmTestIPFSCID123456789";
  const cidHash = Array.from(Buffer.from(sha256.array(cid))); 
  const htmlRoot = Array.from(Buffer.from(sha256.array("<html>Test Root</html>")));

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    program.programId
  );

  const [requestPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("request"), Buffer.from(cidHash)],
    program.programId
  );

  let requestEventListener: number;
  let completedEventListener: number;

  before(async () => {
    requestEventListener = program.addEventListener("verificationRequested", (event, slot) => {
      console.log("VerificationRequested");
      console.log("Sahibi:", event.owner.toBase58());
      console.log("Keywords:", event.keywords); 
    });

    completedEventListener = program.addEventListener("requestCompleted", (event, slot) => {
      console.log("RequestCompleted");
      console.log("Başarılı mı?:", event.success);
    });
  });

  after(async () => {
    await program.removeEventListener(requestEventListener);
    await program.removeEventListener(completedEventListener);
  });

  it("Send SOL to nodes", async () => {
    const airdropAmount = 1 * LAMPORTS_PER_SOL;
    for (const node of [nodeA, nodeB, nodeC]) {
      const tx = await provider.connection.requestAirdrop(node.publicKey, airdropAmount); 
      await provider.connection.confirmTransaction(tx);
    }
  }); 

  it("Initialize system", async () => {
    await program.methods
      .initialize([nodeA.publicKey, nodeB.publicKey, nodeC.publicKey])
      .accounts({
        admin: provider.wallet.publicKey,
      })
      .rpc();

    const configAccount = await program.account.globalConfig.fetch(configPda);
    assert.strictEqual(configAccount.authorizedNodes[0].toBase58(), nodeA.publicKey.toBase58());
    console.log("System initialized successfully");
  });

  it("Create new verification request", async () => {
    const paymentAmount = new anchor.BN(2 * LAMPORTS_PER_SOL); 
    const keywords = ["SEO", "Solana", "Crypto"]; 

    await program.methods
      .submitRequest(cidHash, keywords, paymentAmount)
      .accounts({
        owner: provider.wallet.publicKey,
      })
      .rpc();

    const requestAccount = await program.account.verificationRequest.fetch(requestPda);
    assert.isFalse(requestAccount.isProcessed);
    assert.strictEqual(requestAccount.paymentAmount.toString(), paymentAmount.toString());
    console.log("Request created successfully");
  });

  it("Nodes vote and consensus is achieved (submitHtmlRoot)", async () => {
    await program.methods
      .submitHtmlRoot(cidHash, htmlRoot)
      .accounts({
        signerNode: nodeA.publicKey,
        nodeA: nodeA.publicKey,
        nodeB: nodeB.publicKey,
        nodeC: nodeC.publicKey,
      })
      .signers([nodeA]) 
      .rpc();

    let requestAccount = await program.account.verificationRequest.fetch(requestPda);
    assert.isFalse(requestAccount.isProcessed, "No consensus yet");

    await program.methods
      .submitHtmlRoot(cidHash, htmlRoot)
      .accounts({
        signerNode: nodeB.publicKey,
        nodeA: nodeA.publicKey,
        nodeB: nodeB.publicKey,
        nodeC: nodeC.publicKey,
      })
      .signers([nodeB]) 
      .rpc();

    requestAccount = await program.account.verificationRequest.fetch(requestPda);
    
    assert.isTrue(requestAccount.isProcessed, "Consensus achieved");
    
    const fetchedResultRoot = Buffer.from(requestAccount.resultRoot).toString("hex");
    const expectedRoot = Buffer.from(htmlRoot).toString("hex");
    assert.strictEqual(fetchedResultRoot, expectedRoot, "Result root matches!");
    
    console.log("Consensus achieved and payments distributed");
  });
});