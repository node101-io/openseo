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
                public_inputs: { html_root: string; occurrences: number };
            };

            try {
                if (typeof proof === 'string') {
                    try {
                        proofData = JSON.parse(proof);
                    } catch {
                        const decoded = Buffer.from(proof, 'base64').toString('utf-8');
                        proofData = JSON.parse(decoded);
                    }
                } else {
                    proofData = proof as typeof proofData;
                }
            } catch (e) {
                throw new Error(`Failed to parse proof data: ${(e as Error).message}`);
            }

            const verifyStart = performance.now();
            if (proofData.proof_type === 'zk_snark_proof_generated') {
                const targetDir = path.join(process.cwd(), 'target');
                const proofFilePath = proofData.proof_file_path || path.join(targetDir, 'proof', 'proof');
                const verificationKeyPath = proofData.verification_key_path || path.join(targetDir, 'proof', 'vk');
                const publicInputsPath = path.join(targetDir, 'proof', 'public_inputs');

                if (!fs.existsSync(proofFilePath)) {
                    throw new Error(`Proof file not found: ${proofFilePath}`);
                }
                if (!fs.existsSync(verificationKeyPath)) {
                    throw new Error(`Verification key not found: ${verificationKeyPath}`);
                }

                // Write public inputs if needed
                if (!fs.existsSync(publicInputsPath)) {
                    const pubInputs = {
                        html_root: proofData.public_inputs?.html_root || expectedHtmlRoot,
                        occurrences: proofData.public_inputs?.occurrences || 0
                    };
                    fs.writeFileSync(publicInputsPath, JSON.stringify(pubInputs));
                }

                //bb verify
                try {
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

            } else if (proofData.proof_type === 'zk_snark_circuit_execution_validated') {
                const circuitDir = path.join(process.cwd(), 'circuits', 'v3');

                try {
                    execSync('nargo execute', {
                        cwd: circuitDir,
                        stdio: 'pipe',
                        encoding: 'utf-8'
                    });
                } catch (executeError: unknown) {
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        verifyTime: performance.now() - verifyStart,
                        error: `Circuit execution failed: ${(executeError as Error).message}`
                    };
                }

            } else {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    verifyTime: 0,
                    error: 'Unknown proof type'
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