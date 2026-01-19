import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { VerificationResult } from '../common/ProverTypes.js';
import { performance } from 'perf_hooks';

export namespace ProofVerifier {
    export async function verifyProof(
        proof: string,
        expectedHtmlRoot: string
    ): Promise<VerificationResult> {
        const totalStartTime = performance.now();
        let verifyTime = 0;

        try {
            let proofData: {
                proof_type: string;
                proof_file_path: string;
                verification_key_path: string;
                public_inputs: { html_root: string; total_score?: number };
            };

            try {
                proofData = JSON.parse(proof);
            } catch {
                const decoded = Buffer.from(proof, 'base64').toString('utf-8');
                proofData = JSON.parse(decoded);
            }

            const verifyStart = performance.now();

            // Verify html root is match
            if (proofData.public_inputs?.html_root) {
                const proofHtmlRoot = proofData.public_inputs.html_root;
                const normalizeRoot = (root: string) => root.toLowerCase().replace(/^0x/, '');
                const normalizedProofRoot = normalizeRoot(proofHtmlRoot);
                const normalizedExpectedRoot = normalizeRoot(expectedHtmlRoot);

                if (normalizedProofRoot !== normalizedExpectedRoot) {
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        verifyTime: 0,
                        error: `HTML root mismatch: expected ${expectedHtmlRoot}, but proof contains ${proofHtmlRoot}`
                    };
                }
            } else {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    verifyTime: 0,
                    error: 'Proof does not contain html_root in public_inputs'
                };
            }

            // Support v3 and v4 proof types
            if (proofData.proof_type === 'zk_snark_proof_v3' ||
                proofData.proof_type === 'zk_snark_proof_v4' ||
                proofData.proof_type === 'zk_snark_proof_generated') {

                const targetDir = path.join(process.cwd(), 'target');
                const proofFilePath = proofData.proof_file_path || path.join(targetDir, 'proof', 'proof');
                const verificationKeyPath = proofData.verification_key_path || path.join(targetDir, 'proof', 'vk');

                if (!fs.existsSync(proofFilePath)) {
                    throw new Error(`Proof file not found: ${proofFilePath}`);
                }
                if (!fs.existsSync(verificationKeyPath)) {
                    throw new Error(`Verification key not found: ${verificationKeyPath}`);
                }

                // bb verify
                try {
                    const publicInputsPath = path.join(path.dirname(proofFilePath), 'public_inputs');
                    const bbVerifyCommand = `bb verify -p "${proofFilePath}" -k "${verificationKeyPath}" -i "${publicInputsPath}"`;
                    execSync(bbVerifyCommand, {
                        cwd: process.cwd(),
                        stdio: 'pipe',
                        encoding: 'utf-8'
                    });
                } catch (verifyError: unknown) {
                    const errorMsg = (verifyError as Error).message || String(verifyError);
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        verifyTime: performance.now() - verifyStart,
                        error: `Zk snark proof verification failed: ${errorMsg}`
                    };
                }

            } else {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    verifyTime: 0,
                    error: `Unknown proof type: ${proofData.proof_type}`
                };
            }

            verifyTime = performance.now() - verifyStart;
            console.log('Zk snark proof verification successful');
            return {
                isValid: true,
                totalTime: performance.now() - totalStartTime,
                verifyTime
            };

        } catch (error) {
            return {
                isValid: false,
                totalTime: performance.now() - totalStartTime,
                verifyTime,
                error: (error as Error).message
            };
        }
    }
}
