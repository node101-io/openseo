import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VerificationResult } from '../common/prover-types.js';
import { performance } from 'perf_hooks';
import os from 'os';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { MAX_WORDS } from '../common/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ZKPROOF_ROOT = path.resolve(__dirname, '..', '..', '..');

export namespace ProofVerifier {
    function normalizeHex(hex: string): string {
        let clean = hex.toLowerCase().trim();
        if (clean.startsWith('0x')) {
            clean = clean.slice(2);
        }
        return clean.padStart(64, '0');
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

    export async function verifyProof(
        proofWrapperJSON: string,
        expectedHtmlRoot: string,
        expectedTotalScore?: number,
        expectedKeywordScores?: { keyword: string; score: number }[],
        expectedRawKeywordScores?: number[]
    ): Promise<VerificationResult> {
        const totalStartTime = performance.now();
        let verifyTime = 0;

        try {
            let proofData: {
                proof_type: string;
                proof: number[]; 
                public_inputs: { 
                    html_root: string; 
                    total_score?: string | number; 
                    raw_keyword_scores?: number[]; 
                };
            };

            try {
                proofData = JSON.parse(proofWrapperJSON);
            } catch {
                const decoded = Buffer.from(proofWrapperJSON, 'base64').toString('utf-8');
                proofData = JSON.parse(decoded);
            }

            const verifyStart = performance.now();

            if (!proofData.public_inputs?.html_root) {
                throw new Error('Proof does not contain html_root');
            }

            const normProofRoot = normalizeHex(proofData.public_inputs.html_root);
            const normExpectedRoot = normalizeHex(expectedHtmlRoot);
            if (normProofRoot !== normExpectedRoot) {
                return { isValid: false, totalTime: performance.now() - totalStartTime, verifyTime: 0, error: `HTML root mismatch` };
            }

            const proofScore = Number(proofData.public_inputs.total_score);
            const rawScores: number[] = (proofData.public_inputs.raw_keyword_scores || []).map((x: any) => Number(x));
            const rawScoreSum = rawScores.reduce((sum, v) => sum + v, 0);

            if (!Array.isArray(proofData.public_inputs.raw_keyword_scores) || rawScores.length === 0) {
                console.warn('[ProofVerifier] raw_keyword_scores missing from proof; skipping raw score exact sum check.');
            } else if (proofScore !== rawScoreSum) {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    verifyTime: 0,
                    error: `Total proof score mismatch: proof.total_score=${proofScore} vs sum(raw_keyword_scores)=${rawScoreSum}`
                };
            }

            if (expectedRawKeywordScores !== undefined && expectedRawKeywordScores.length > 0 && rawScores.length > 0) {
                const expectedRawSum = expectedRawKeywordScores.reduce((sum, v) => sum + v, 0);
                if (expectedRawSum !== rawScoreSum) {
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        verifyTime: 0,
                        error: `Raw keyword score mismatch: expected=${expectedRawSum} vs proof=${rawScoreSum}`
                    };
                }
            }
            if (expectedKeywordScores !== undefined && expectedKeywordScores.length > 0) {
                const calculatedKeywordSum = expectedKeywordScores.reduce((sum, item) => sum + item.score, 0);
                if (calculatedKeywordSum > proofScore) {
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        verifyTime: 0,
                        error: `Keyword scores manipulation detected! Calculated: ${calculatedKeywordSum}, Proof Score: ${proofScore}`
                    };
                }

                if (calculatedKeywordSum !== proofScore) {
                    console.warn(`Warning: keyword score sum is ${calculatedKeywordSum}, proof total is ${proofScore}. Using partial keyword score assertion.`);
                }
            }
            
            const circuitPath = path.resolve(ZKPROOF_ROOT, 'target/zkseo.json');
            if (!fs.existsSync(circuitPath)) {
                throw new Error(`Circuit file not found. Please run 'nargo compile'.`);
            }

            const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
            const api = await Barretenberg.new({ threads: os.cpus().length });
            const honkBackend = new UltraHonkBackend(circuit.bytecode, api);
            const proofBuffer = new Uint8Array(proofData.proof);

            const publicInputs = [
                toFieldHex(proofData.public_inputs.html_root),
                toFieldHex(proofData.public_inputs.total_score || 0)
            ];

            const proofRawScores = proofData.public_inputs.raw_keyword_scores || [];
            for (let i = 0; i < MAX_WORDS; i++) {
                publicInputs.push(toFieldHex(proofRawScores[i] || 0));
            }

            const isValid = await honkBackend.verifyProof({
                proof: proofBuffer,
                publicInputs: publicInputs
            });

            verifyTime = performance.now() - verifyStart;
            console.log(`[ProofVerifier] Result: ${isValid ? 'SUCCESS' : 'FAILED'}`);
            
            if (!isValid) {
                 return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    verifyTime,
                    error: `Cryptographic verification failed.`
                };
            }

            return {
                isValid: true,
                totalTime: performance.now() - totalStartTime,
                verifyTime
            };

        } catch (error) {
            console.error('[ProofVerifier] Error:', error);
            return {
                isValid: false,
                totalTime: performance.now() - totalStartTime,
                verifyTime: 0,
                error: `Verification process error: ${(error as Error).message}`
            };
        }
    }
}