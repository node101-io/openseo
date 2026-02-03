import fs from 'fs';
import { CircuitProof } from "@openseo/zkproof";
import { getOpenSEOABI } from "@openseo/contract";
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const FILECOIN_URL = process.env.FILECOIN_URL || 'https://openseo-filecoin.openseo.workers.dev';
const DA_URL = process.env.DA_URL || 'https://openseo-da.openseo.workers.dev';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || '';

function workerHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (WORKER_API_KEY) h['X-API-Key'] = WORKER_API_KEY;
    return h;
}

async function run(filePath: string, siteUrl: string, keywordsRaw: string) {
    try {
        const keywords = JSON.parse(keywordsRaw);
        if (!fs.existsSync(filePath)) throw new Error(`Dosya bulunamadı: ${filePath}`);
        const htmlContent = fs.readFileSync(filePath, 'utf-8');
        const proofResult = await CircuitProof.generateProof(htmlContent, keywords);
        if (!proofResult.success) throw new Error('Proof generation failed');

        const filecoinRes = await axios.post(`${FILECOIN_URL}/send_file`, 
            { file: htmlContent }, { headers: workerHeaders() }
        );
        const cid = filecoinRes.data.cid;
        console.log(`Filecoin CID: ${cid}`);

        const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);
        const wallet = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY!, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS!, getOpenSEOABI(), wallet);
        
        const fee = ethers.parseEther("1"); 
        const tx = await contract.submitRequest(cid, keywords, { value: fee, gasLimit: 500000 });
        await tx.wait();

        await axios.post(`${DA_URL}/submit_proof`, {
            proof: proofResult.proof,
            root: proofResult.htmlRoot,
            keywords,
            siteUrl,
            totalScore: proofResult.totalScore
        }, { headers: workerHeaders() });

    } catch (error: any) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// npx ts-node cli.ts <path> <site_url> '<keywords>'
const [file, url, keys] = process.argv.slice(2);
run(file, url, keys);