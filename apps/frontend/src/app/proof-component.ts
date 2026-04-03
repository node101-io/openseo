'use client';
import { Connection, PublicKey } from '@solana/web3.js';
import { createProgram, getRequestPda, splitCid } from '@openseo/contracts';

export interface ProofPackage {
  proof_type: string;
  proof_file_path: string;
  verification_key_path: string;
  proof?: number[];
  vk?: number[];
  public_inputs_raw?: number[];
  public_inputs: {
    html_root: string;
    total_score: number;
    raw_keyword_scores?: number[];
  };
}

export interface VerifyResult {
  verified: boolean;
  error?: string;
  verifyTime?: number;
}

export interface GenerateResult {
  proof: Uint8Array;
  publicInputs: any[];
  verified: boolean;
}

function decodeProof(proofBase64: string): ProofPackage {
  const decoded = atob(proofBase64);
  return JSON.parse(decoded);
}

function toFieldHex(val: string | number): string {
  let hex = val.toString();
  if (typeof val === 'number') {
    hex = val.toString(16);
  }
  hex = hex.replace(/^0x/, '');
  hex = hex.padStart(64, '0'); 
  return '0x' + hex;
}

let circuit: any = null;
let bbApi: any = null;
let honkBackend: any = null;
let noir: any = null;
let initPromise: Promise<void> | null = null;

async function initializeBackend(): Promise<void> {
  if (honkBackend && noir) {
    return;
  }

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    const { Barretenberg, UltraHonkBackend } = await import('@aztec/bb.js');
    const { Noir } = await import('@noir-lang/noir_js');
    
    const response = await fetch('/zkseo.json');
    if (!response.ok) throw new Error('Failed to load circuit');
    circuit = await response.json();    
    noir = new Noir(circuit);    
    const threads = Math.min(navigator.hardwareConcurrency || 4, 8);
    try {
      bbApi = await Barretenberg.new({ threads });
    } catch (error) {
      console.error("Barretenberg initialized error:", error);
      throw error;
    }
    honkBackend = new UltraHonkBackend(circuit.bytecode, bbApi);
    console.log('[Verify] Initialized');
  })();

  await initPromise;
}

export async function verifyProofClientSide(
proofBase64: string, cid: string, totalScore: number, keywordScores: { keyword: string; score: number; }[], rpcUrl: string = "https://api.devnet.solana.com"): Promise<VerifyResult> {
  const startTime = performance.now();
  
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    
    const program = createProgram(connection, dummyWallet as any);
    const fullCid = cid.trim();
    const { cid_part1, cid_part2 } = splitCid(fullCid); 
    const [requestPda] = getRequestPda(cid_part1, cid_part2, program.programId);

    let contractRootHex = "";
    
    const account = await program.account.verificationRequestRecord.fetch(requestPda);
    if (!account.isProcessed) {
      return { verified: false, error: "This request is not processed on Solana" };
    }

    const rootBytes = account.resultRoot as number[];
    contractRootHex = Array.from(rootBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const proofPackage = decodeProof(proofBase64);
    const proofHtmlRoot = proofPackage.public_inputs.html_root.replace(/^0x/, '');

    if (contractRootHex.toLowerCase() !== proofHtmlRoot.toLowerCase()) {
      return {
        verified: false,
        error: `Root mismatch: ${contractRootHex}, ZK Proof: ${proofHtmlRoot}`
      };
    }
    await initializeBackend();
    if (!honkBackend) throw new Error('Backend not initialized');
    const proof = new Uint8Array(proofPackage.proof || []);
    const { html_root, total_score, raw_keyword_scores } = proofPackage.public_inputs;

    
    const publicInputs = [
      toFieldHex(html_root),
      toFieldHex(total_score)
    ];
        
    const MAX_WORDS = 32;
    const proofRawScores = raw_keyword_scores || [];

    for (let i = 0; i < MAX_WORDS; i++) {
        publicInputs.push(toFieldHex(proofRawScores[i] || 0));
    }

    const verified = await honkBackend.verifyProof({ proof, publicInputs });    
    const verifyTime = performance.now() - startTime;

    return {
      verified,
      verifyTime,
      error: verified ? undefined : 'Proof verification failed'
    };

  } catch (error) {
    console.error('[Verify] ERROR:', error);
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      verifyTime: performance.now() - startTime
    };
  }
}

export async function generateProofClientSide(inputs: any): Promise<GenerateResult> {
    await initializeBackend();
    const { witness } = await noir.execute(inputs);
    const { proof, publicInputs } = await honkBackend.generateProof(witness);
    const verified = await honkBackend.verifyProof({ proof, publicInputs });
    return { proof, publicInputs, verified };
}