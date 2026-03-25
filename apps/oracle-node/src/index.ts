import axios from "axios";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { CircuitProof } from "@openseo/zkproof";
import {
  createProgram,
  getConfigPda,
  getRequestPda,
  cidToHash,
  Contracts
} from "@openseo/contracts";
import { Program, Wallet } from "@coral-xyz/anchor";

const VERIFICATION_TIMEOUT = 300; 

export class NodeService {
  private connection!: Connection;
  private program!: Program<Contracts>;
  private keypair!: Keypair;
  private nodeName: string;
  private nodePrivateKey: string;
  private programId: PublicKey;
  private rpcUrl: string;
  private filecoinUrl: string;
  private lastProcessedSlot = 0;
  private pollingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private completedRequests = new Set<string>(); 
  private processingRequests = new Set<string>(); 
  private lastCleanupTime = 0;

  constructor(
    nodeName: string,
    nodePrivateKey: string,
    programId: string,
    rpcUrl: string,
    filecoinUrl: string
  ) {
    this.nodeName = nodeName;
    this.nodePrivateKey = nodePrivateKey;
    this.programId = new PublicKey(programId);
    this.rpcUrl = rpcUrl;
    this.filecoinUrl = filecoinUrl;
  }

  async initialize(): Promise<boolean> {
    try {
      this.connection = new Connection(this.rpcUrl, "confirmed");
      const secret = JSON.parse(this.nodePrivateKey) as number[];
      this.keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
      const wallet = new Wallet(this.keypair);
      this.program = createProgram(this.connection, wallet) as unknown as Program<Contracts>;
      const [configPda] = getConfigPda(this.programId);
      const info = await this.connection.getAccountInfo(configPda);
      if (!info) {
        console.warn(`[${this.nodeName}] Config PDA yok`);
        return false;
      }

      const balance = await this.connection.getBalance(this.keypair.publicKey);
      console.log(
        `[${this.nodeName}] connected to solana. Addresses: ${this.keypair.publicKey.toBase58()}, ` +
          `Balance: ${balance / 1e9} SOL`
      );
      return true;
    } catch (e: any) {
      console.error(`[${this.nodeName}] initialize error:`, e.message);
      return false;
    }
  }

  async startEventListener(): Promise<void> {
    if (!this.program) {
      console.warn(`[${this.nodeName}] Program not initialized`);
      return;
    }
    this.lastProcessedSlot = await this.connection.getSlot();
    console.log(`[${this.nodeName}] Polling starting, slot: ${this.lastProcessedSlot}`);

    this.pollingInterval = setInterval(async () => {
      try {
        await this.poll();
      } catch (e: any) {
        console.error(`[${this.nodeName}] polling error:`, e.message);
      }
    }, 3000);

    this.startCleanupTask();
  }

  private async poll(): Promise<void> {
    const requests = await this.program.account.verificationRequest.all();
    for (const { publicKey, account } of requests) {
      const cid = account.cidStr;
      const keywords = account.keywords as string[];
      if (this.completedRequests.has(cid) || this.processingRequests.has(cid)) continue;

      this.processingRequests.add(cid);
      console.log(`[${this.nodeName}] New Request for CID: ${cid}`);
      await this.processVerificationRequest(cid, keywords);
      this.processingRequests.delete(cid);
    }
  }

  private startCleanupTask(): void {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    this.lastCleanupTime = Date.now();
    this.cleanupExpiredRequests();

    this.cleanupInterval = setInterval(() => {
      if (Date.now() - this.lastCleanupTime >= ONE_DAY_MS) {
        this.lastCleanupTime = Date.now();
        this.cleanupExpiredRequests();
      }
    }, ONE_DAY_MS);
  }

  private async cleanupExpiredRequests(): Promise<void> {
    console.log(`[${this.nodeName}] Expired requests cleanup started`);
    const now = Math.floor(Date.now() / 1000);
    const requests = await this.program.account.verificationRequest.all();
    let cleaned = 0;

    for (const { publicKey, account } of requests) {
      if (account.isProcessed) continue;
      if (now <= account.timestamp.toNumber() + VERIFICATION_TIMEOUT) continue;
      const cidRaw = Array.from(account.cid as number[]); 

      try {
        await this.program.methods
          .cleanExpiredRequest(cidRaw) 
          .accounts({ 
            caller: this.keypair.publicKey 
          })
          .signers([this.keypair])
          .rpc();

        this.completedRequests.add(publicKey.toBase58());
        cleaned++;
      } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("AlreadyProcessed")) this.completedRequests.add(publicKey.toBase58());
        else console.error(`[${this.nodeName}] cleanup error:`, msg);
      }
    }
    console.log(`[${this.nodeName}] ${cleaned} expired requests cleaned up`);
  }

  private async processVerificationRequest(cid: string, keywords: string[]): Promise<void> {
    try {
      const cidHash = cidToHash(cid);
      const [requestPda] = getRequestPda(cidHash, this.programId);
      const req = await this.program.account.verificationRequest.fetch(requestPda);

      if (req.isProcessed) {
        this.completedRequests.add(cid);
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      if (now > req.timestamp.toNumber() + VERIFICATION_TIMEOUT) return;

      const hasVoted = req.votes.some((v: any) => v.node.equals(this.keypair.publicKey));
      if (hasVoted) return;
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 2000) + 500));
      let html: string;
      if (this.filecoinUrl.includes("r2.dev")) {
        const url = `${this.filecoinUrl.replace(/\/$/, "")}/${cid}`;
        html = (await axios.get<string>(url, { timeout: 10000, responseType: "text" })).data;
      } else {
        const res = await axios.get<{ success: boolean; file?: string }>(
          `${this.filecoinUrl}/html_file/${cid}`,
          { timeout: 10000 }
        );
        if (!res.data.success || !res.data.file) {
          console.error(`[${this.nodeName}] File not found for CID: ${cid}`);
          return;
        }
        html = res.data.file;
      }

      const zk = await CircuitProof.generateHtmlRoot(html, keywords);
      if (!zk.success || !zk.htmlRoot) {
        console.error(`[${this.nodeName}] ZK-proof failed`);
        return;
      }
      const rootHex = zk.htmlRoot.startsWith("0x") ? zk.htmlRoot.slice(2) : zk.htmlRoot;
      const rootBytes = Array.from(Buffer.from(rootHex, "hex"));
      if (rootBytes.length !== 32) throw new Error("root is not 32 bytes");

      const [configPda] = getConfigPda(this.programId);
      const config = await this.program.account.globalConfig.fetch(configPda);
      const [nodeA, nodeB, nodeC] = config.authorizedNodes;

      const sig = await this.program.methods
        .submitHtmlRoot(cidHash, rootBytes)
        .accounts({
          signerNode: this.keypair.publicKey,
          nodeA,
          nodeB,
          nodeC,
        })
        .signers([this.keypair])
        .rpc();

      console.log(`[${this.nodeName}] Send tx: ${sig}`);
      this.completedRequests.add(cid);
    } catch (e: any) {
      const msg = e.message || "";
      if (msg.includes("AlreadyVoted")) console.log(`[${this.nodeName}] Already voted for CID: ${cid}`);
      else if (msg.includes("AlreadyProcessed")) this.completedRequests.add(cid);
      else console.error(`[${this.nodeName}] process error:`, msg);
    }
  }

  stopEventListener(): void {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    console.log(`[${this.nodeName}] Stopped`);
  }

  getAddress(): string {
    return this.keypair?.publicKey?.toBase58() ?? "";
  }
  getNodeName(): string {
    return this.nodeName;
  }
}