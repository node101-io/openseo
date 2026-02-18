import fs from 'fs';
import { DA_URL, workerHeaders } from './config';

export interface SubmitProofParams {
    proof: string;
    root: string;
    keywords: string[];
    siteUrl: string;
    totalScore: number;
}

function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

export async function submitProofToDa(params: SubmitProofParams): Promise<void> {
    const res = await fetchWithTimeout(
        `${DA_URL}/submit_proof`,
        {
            method: 'POST',
            headers: workerHeaders(),
            body: JSON.stringify({
                proof: params.proof,
                root: params.root,
                keywords: params.keywords,
                siteUrl: params.siteUrl,
                totalScore: params.totalScore,
            }),
        },
        60000
    );
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok) {
        throw new Error(data?.error || `DA request failed: ${res.status}`);
    }
    if (data?.success === false) {
        throw new Error(data.error || 'DA submission failed');
    }
}

const PROOF_OUTPUT_FILE = 'output/proof-output.json';

async function main() {
    const [proofOutputPathArg, siteUrlArg] = process.argv.slice(2);
    const proofOutputPath = proofOutputPathArg || process.env.PROOF_OUTPUT_FILE || PROOF_OUTPUT_FILE;
    const siteUrl = siteUrlArg || process.env.TEST_SITE_URL || process.env.SITE_URL;
    if (!siteUrl) {
        console.error('Usage: tsx submit-proof-da.ts <proof-output.json> <siteUrl>');
        console.error('Or set env: TEST_SITE_URL (or SITE_URL). Proof file defaults to .proof-output.json');
        process.exit(1);
    }
    if (!fs.existsSync(proofOutputPath)) {
        console.error('Proof file not found:', proofOutputPath);
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(proofOutputPath, 'utf-8')) as {
        proof: string;
        htmlRoot: string;
        totalScore: number;
        keywords: string[];
    };
    await submitProofToDa({
        proof: data.proof,
        root: data.htmlRoot,
        keywords: data.keywords,
        siteUrl,
        totalScore: data.totalScore,
    });
    console.log(JSON.stringify({ success: true }));
}

const run = process.argv[1]?.includes('submit-proof-da');
if (run) {
    main().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
