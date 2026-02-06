import fs from 'fs';
import { ethers } from 'ethers';
import { getOpenSEOABI } from '@openseo/contract';
import { CONTRACT_ADDRESS, ETHEREUM_RPC_URL, OWNER_PRIVATE_KEY } from './config';

export interface SubmitRequestResult {
    txHash: string;
    blockNumber: number;
}

export async function submitRequestToEth(cid: string, keywords: string[]): Promise<SubmitRequestResult> {
    if (!CONTRACT_ADDRESS) throw new Error('CONTRACT_ADDRESS is not set');
    if (!OWNER_PRIVATE_KEY) throw new Error('OWNER_PRIVATE_KEY is not set');

    const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL || undefined);
    const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, getOpenSEOABI(), wallet);

    const fee = ethers.parseEther('0.0001');
    const tx = await contract.submitRequest(cid, keywords, { value: fee, gasLimit: 500000 });
    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction receipt missing');

    return {
        txHash: receipt.hash,
        blockNumber: Number(receipt.blockNumber),
    };
}

const PROOF_OUTPUT_FILE = 'output/proof-output.json';
const CID_FILE = 'output/cid.json';

async function main() {
    let cid = process.env.CID || process.argv[2];
    if (!cid && fs.existsSync(CID_FILE)) {
        const data = JSON.parse(fs.readFileSync(CID_FILE, 'utf-8'));
        cid = data?.cid;
    }
    let keywordsRaw: string | undefined = process.argv[3];
    if (!keywordsRaw) {
        keywordsRaw = process.env.TEST_KEYWORDS || process.env.KEYWORDS || undefined;
        if (!keywordsRaw && fs.existsSync(PROOF_OUTPUT_FILE)) {
            const proofData = JSON.parse(fs.readFileSync(PROOF_OUTPUT_FILE, 'utf-8'));
            keywordsRaw = JSON.stringify(proofData.keywords || []);
        }
    }
    if (!cid || !keywordsRaw) {
        console.error('Usage: tsx submit-request-eth.ts <cid> \'["keyword1","keyword2"]\'');
        console.error('Or run after upload-filecoin (reads output/cid.json) or set env CID and KEYWORDS');
        process.exit(1);
    }
    const keywordsStr: string = keywordsRaw;
    const keywords = JSON.parse(keywordsStr) as string[];
    if (!Array.isArray(keywords)) {
        console.error('keywords must be a JSON array');
        process.exit(1);
    }
    const result = await submitRequestToEth(cid, keywords);
    console.log(JSON.stringify(result));
}

const run = process.argv[1]?.includes('submit-request-eth');
if (run) {
    main().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
