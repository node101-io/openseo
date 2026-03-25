import fs from 'fs';
import * as dotenv from 'dotenv';
import { CircuitProof } from '@openseo/zkproof';

dotenv.config();

export interface GenerateProofResult {
    proof: string;
    htmlRoot: string;
    totalScore: number;
    keywords: string[];
}

export async function generateProof(
    htmlContent: string,
    keywords: string[]
): Promise<GenerateProofResult> {
    const result = await CircuitProof.generateProof(htmlContent, keywords);
    if (!result.success) {
        throw new Error(result.error || 'Proof generation failed');
    }
    return {
        proof: result.proof,
        htmlRoot: result.htmlRoot,
        totalScore: result.totalScore ?? 0,
        keywords,
    };
}

const PROOF_OUTPUT_FILE = 'output/proof-output.json';

async function main() {
    const [pathArg, keywordsRawArg] = process.argv.slice(2);
    const path = pathArg || process.env.TEST_HTML_PATH || "";
    const keywordsRaw = keywordsRawArg || process.env.TEST_KEYWORDS || "";
    if (!path || !keywordsRaw) {
        console.error('Usage: tsx generate-proof.ts <path> \'["keyword1","keyword2"]\'');
        console.error('Or set env: TEST_HTML_PATH');
        process.exit(1);
    }
    const keywords = JSON.parse(keywordsRaw) as string[];
    if (!Array.isArray(keywords)) {
        console.error('keywords must be a JSON array');
        process.exit(1);
    }
    const htmlContent = fs.readFileSync(path, 'utf-8');
    const out = await generateProof(htmlContent, keywords);
    fs.writeFileSync(PROOF_OUTPUT_FILE, JSON.stringify(out));
}

const run = process.argv[1]?.includes('generate-proof');
if (run) {
    main().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
