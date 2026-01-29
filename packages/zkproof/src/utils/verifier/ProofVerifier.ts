import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VerificationResult } from '../common/ProverTypes.js';
import { performance } from 'perf_hooks';
import os from 'os';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';

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
        expectedTotalScore?: number
    ): Promise<VerificationResult> {
        const totalStartTime = performance.now();
        let verifyTime = 0;

        try {
            let proofData: {
                proof_type: string;
                proof: number[]; 
                public_inputs: { html_root: string; total_score?: string | number };
            };

            try {
                proofData = JSON.parse(proofWrapperJSON);
            } catch {
                const decoded = Buffer.from(proofWrapperJSON, 'base64').toString('utf-8');
                proofData = JSON.parse(decoded);
            }

            const verifyStart = performance.now();

            if (!proofData.public_inputs?.html_root) {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    verifyTime: 0,
                    error: 'Proof does not contain html_root in public_inputs'
                };
            }

            const normProofRoot = normalizeHex(proofData.public_inputs.html_root);
            const normExpectedRoot = normalizeHex(expectedHtmlRoot);
            if (normProofRoot !== normExpectedRoot) {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    verifyTime: 0,
                    error: `HTML root mismatch: expected ${expectedHtmlRoot}, got ${proofData.public_inputs.html_root}`
                };
            }

            if (expectedTotalScore !== undefined) {
                if (proofData.public_inputs.total_score === undefined) {
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        verifyTime: 0,
                        error: 'Expected total score check, but proof missing "total_score"'
                    };
                }
                const proofScore = Number(proofData.public_inputs.total_score);
                if (proofScore !== expectedTotalScore) {
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        verifyTime: 0,
                        error: `Total score mismatch: expected ${expectedTotalScore}, got ${proofScore}`
                    };
                }
            }
            
            const circuitPath = path.resolve(ZKPROOF_ROOT, 'target/zkseo.json');
            if (!fs.existsSync(circuitPath)) {
                throw new Error(`Circuit file not found at ${circuitPath}`);
            }

            const circuitContent = fs.readFileSync(circuitPath, 'utf-8');
            const circuit = JSON.parse(circuitContent);
            const threads = os.cpus().length;
            const api = await Barretenberg.new({ threads });
            const honkBackend = new UltraHonkBackend(circuit.bytecode, api);
            const proofBuffer = new Uint8Array(proofData.proof);

            const publicInputs = [
                toFieldHex(proofData.public_inputs.html_root),
                toFieldHex(proofData.public_inputs.total_score || 0)
            ];

            const isValid = await honkBackend.verifyProof({
                proof: proofBuffer,
                publicInputs: publicInputs
            });

            verifyTime = performance.now() - verifyStart;
            console.log(`[ProofVerifier] Result: ${isValid ? '✅ SUCCESS' : '❌ FAILED'}`);
            
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
                verifyTime,
                error: `Verification process error: ${(error as Error).message}`
            };
        }
    }
}