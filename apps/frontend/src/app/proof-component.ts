'use client';
import { Connection, PublicKey } from '@solana/web3.js';
import { createProgram, getRequestPda, cidToHash } from '@openseo/contracts';

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

    const prevFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'object' && 'url' in input ? input.url : input);
      if (url.startsWith('https://crs.aztec.network')) {
        return prevFetch(url.replace('https://crs.aztec.network', '/aztec-crs'), init);
      }
      return prevFetch(input, init);
    };

    try {
      bbApi = await Barretenberg.new({ threads });
    } finally {
      globalThis.fetch = prevFetch;
    }
    honkBackend = new UltraHonkBackend(circuit.bytecode, bbApi);
    console.log('[Verify] Initialized');
  })();

  await initPromise;
}

export async function verifyProofClientSide(
  proofBase64: string,
  cid: string, 
  rpcUrl: string = "https://api.devnet.solana.com"
): Promise<VerifyResult> {
  const startTime = performance.now();
  
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    console.log("Connection", connection);
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    
    const program = createProgram(connection, dummyWallet as any);
    const cleanCid = cid.trim();
    const cidHash = cidToHash(cleanCid);
    const [requestPda] = getRequestPda(cidHash, program.programId);

    let contractRootHex = "";
    
    const account = await program.account.verificationRequest.fetch(requestPda);
    if (!account.isProcessed) {
      return { verified: false, error: "This request is not processed on Solana" };
    }

    const rootBytes = account.resultRoot as number[];
    console.log("Root Bytes" ,rootBytes);
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
    const { html_root, total_score } = proofPackage.public_inputs;
    console.log("Result:", proof + html_root + total_score);
    
    const publicInputs = [
      toFieldHex(html_root),
      toFieldHex(total_score)
    ];
        
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