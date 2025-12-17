import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { VerificationResult } from '../common/ProverTypes.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { Fr } from '@aztec/bb.js';
import { formatHashResult, hashToNoirField } from '../common/hashUtils.js';
import { performance } from 'perf_hooks';

const api = await barretenbergApi.getBarretenbergApi();

export namespace ProofVerifier {
    export async function verifyProof(
        proof: any,
        publicInputs: any,
        htmlRoot: string
    ): Promise<VerificationResult> {
        const totalStartTime = performance.now();
        let circuitLoadTime = 0;
        let verifyTime = 0;

        try {
            const circuitDir = path.join(process.cwd(), 'circuits', 'v3');
            const proverTomlPath = path.join(circuitDir, 'Prover.toml');
            if (!fs.existsSync(proverTomlPath)) {
                throw new Error(`Prover.toml not found at ${proverTomlPath}. Proof generation must be run first.`);
            }
            
            const tomlContent = fs.readFileSync(proverTomlPath, 'utf-8');
            
            const parseArray = (content: string, key: string): string[] => {
                const lines = content.split('\n');
                let arrayLine = '';
                for (const line of lines) {
                    if (line.trim().startsWith(`${key} = `)) {
                        arrayLine = line.trim();
                        break;
                    }
                }
                if (!arrayLine) return [];
                
                const match = arrayLine.match(/\[(.*)\]/);
                if (!match) return [];
                
                const arrContent = match[1];
                const arr = arrContent
                    .split(',')
                    .map(s => s.trim().replace(/"/g, ''))
                    .filter(h => h.length > 0);
                
                return arr;
            };
            
            const parseIntArray = (content: string, key: string): number[] => {
                const regex = new RegExp(`${key} = \\[([\\s\\S]*?)\\]`, 'm');
                const match = content.match(regex);
                if (!match) return [];
                return match[1]
                    .split(',')
                    .map(s => {
                        const cleaned = s.trim().replace(/\n/g, '').replace(/\r/g, '');
                        return cleaned.length > 0 ? parseInt(cleaned) : 0;
                    })
                    .filter(v => !isNaN(v));
            };
            
            const wordHashes = parseArray(tomlContent, 'word_hashes');
            const isKeyword = parseIntArray(tomlContent, 'is_keyword');
            const scores = parseIntArray(tomlContent, 'scores');
            const keywordHashes = parseArray(tomlContent, 'keyword_hashes');
            const chunkCountMatch = tomlContent.match(/chunk_count = (\d+)/);
            const chunkCount = chunkCountMatch ? parseInt(chunkCountMatch[1]) : wordHashes.filter(h => h !== '0x0').length;
            const occurrencesMatch = tomlContent.match(/occurrences = (\d+)/);
            const occurrences = occurrencesMatch ? parseInt(occurrencesMatch[1]) : 0;
            const keywordCountMatch = tomlContent.match(/keyword_count = (\d+)/);
            const keywordCount = keywordCountMatch ? parseInt(keywordCountMatch[1]) : keywordHashes.filter(h => h !== '0x0').length;
            
            console.log('Verifying ZK-SNARK proof...');
            const verifyStart = performance.now();
            
            let proofData: any;
            try {
                if (typeof proof === 'string') {
                    try {
                        proofData = JSON.parse(proof);
                    } catch {
                        try {
                            const decoded = Buffer.from(proof, 'base64').toString('utf-8');
                            proofData = JSON.parse(decoded);
                        } catch {
                            throw new Error('Proof is neither valid JSON nor base64 encoded JSON');
                        }
                    }
                } else {
                    proofData = proof;
                }
            } catch (e) {
                throw new Error(`Failed to parse proof data: ${(e as Error).message}`);
            }
            
            if (proofData.proof_type === 'zk_snark_proof_generated') {
                const circuitLoadStart = performance.now();
                const targetDir = path.join(process.cwd(), 'target');
                const proofFilePath = proofData.proof_file_path || path.join(targetDir, 'proof', 'proof');
                const verificationKeyPath = proofData.verification_key_path || path.join(targetDir, 'proof', 'vk');
                const publicInputsPath = path.join(targetDir, 'proof', 'public_inputs');
                if (!fs.existsSync(publicInputsPath)) {
                    const publicInputsJson = JSON.stringify({
                        html_root: proofData.public_inputs?.html_root || htmlRoot,
                        occurrences: proofData.public_inputs?.occurrences || 0
                    });
                    fs.writeFileSync(publicInputsPath, publicInputsJson);
                }
                
                try {
                    const bbVerifyCommand = `bb verify -p "${proofFilePath}" -k "${verificationKeyPath}" -i "${publicInputsPath}"`;
                    const verifyOutput = execSync(bbVerifyCommand, {
                        cwd: process.cwd(),
                        stdio: 'pipe',
                        encoding: 'utf-8'
                    });
                    
                    if (verifyOutput) {
                        console.log(`  bb verify output: ${verifyOutput.substring(0, 200)}`);
                    }
                    
                    console.log('  ZK-SNARK proof verification successful');
                    circuitLoadTime = performance.now() - circuitLoadStart;
                } catch (verifyError: any) {
                    const errorMsg = verifyError.message || verifyError.toString();
                    if (verifyError.stdout) {
                        console.log(`  bb stdout: ${verifyError.stdout.substring(0, 500)}`);
                    }
                    if (verifyError.stderr) {
                        console.log(`  bb stderr: ${verifyError.stderr.substring(0, 500)}`);
                    }
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        circuitLoadTime: performance.now() - circuitLoadStart,
                        verifyTime: performance.now() - verifyStart,
                        error: `ZK-SNARK proof verification failed: ${errorMsg}`
                    };
                }
            } else if (proofData.proof_type === 'zk_snark_circuit_execution_validated') {
                const circuitLoadStart = performance.now();
                
                const circuitDir = path.join(process.cwd(), 'circuits', 'v3');
                try {
                    execSync('nargo execute', { 
                        cwd: circuitDir,
                        stdio: 'pipe', 
                        encoding: 'utf-8' 
                    });
                } catch (executeError: any) {
                    const errorMsg = executeError.message || executeError.toString();
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        circuitLoadTime: performance.now() - circuitLoadStart,
                        verifyTime: performance.now() - verifyStart,
                        error: `Circuit execution verification failed: ${errorMsg}`
                    };
                }
                circuitLoadTime = performance.now() - circuitLoadStart;
            } else {
                console.log('  Warning: Unknown proof type, performing basic validation');
            }
            
            let found = 0;
            for (let i = 0; i < chunkCount; i++) {
                if (isKeyword[i] === 1) {
                    const wordHash = wordHashes[i];
                    let matchesKeyword = false;
                    for (let j = 0; j < keywordCount; j++) {
                        if (wordHash.toLowerCase() === keywordHashes[j].toLowerCase()) {
                            matchesKeyword = true;
                            break;
                        }
                    }
                    if (!matchesKeyword) {
                        return {
                            isValid: false,
                            totalTime: performance.now() - totalStartTime,
                            circuitLoadTime: 0,
                            verifyTime: performance.now() - verifyStart,
                            error: `Word hash at index ${i} does not match any keyword hash`
                        };
                    }
                    found++;
                }
            }
            
            // Verify occurrences match
            if (found !== occurrences) {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    circuitLoadTime: 0,
                    verifyTime: performance.now() - verifyStart,
                    error: `Found ${found} keywords but expected ${occurrences}`
                };
            }
            
            let currentRoot = new Fr(BigInt(0));
            for (let i = 0; i < chunkCount; i++) {
                const wordHash = wordHashes[i];
                const isKw = isKeyword[i] === 1;
                if (isKw) {
                    // Keyword: H(current_root, H(word_hash, score))
                    const wordHashValue = barretenbergApi.hexToFieldValue(wordHash);
                    const wordField = new Fr(wordHashValue);
                    const scoreField = new Fr(BigInt(scores[i]));
                    const wordScoreHash = api.pedersenHash([wordField, scoreField], 0);
                    currentRoot = api.pedersenHash([currentRoot, wordScoreHash], 0);
                } else {
                    // Chunk: H(current_root, chunk_hash)
                    const chunkHashValue = barretenbergApi.hexToFieldValue(wordHash);
                    const chunkField = new Fr(chunkHashValue);
                    currentRoot = api.pedersenHash([currentRoot, chunkField], 0);
                }
            }
            
            const calculatedHtmlRoot = formatHashResult(currentRoot);
            const formattedCalculatedRoot = hashToNoirField(calculatedHtmlRoot);
            const formattedExpectedRoot = hashToNoirField(htmlRoot);
            
            if (formattedCalculatedRoot.toLowerCase() !== formattedExpectedRoot.toLowerCase()) {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    circuitLoadTime: 0,
                    verifyTime: performance.now() - verifyStart,
                    error: `Calculated html_root does not match expected. Expected: ${formattedExpectedRoot}, Got: ${formattedCalculatedRoot}`
                };
            }
            
            const verifyEnd = performance.now();
            verifyTime = verifyEnd - verifyStart;            
            const totalEndTime = performance.now();
            const totalTime = totalEndTime - totalStartTime;

            return {
                isValid: true,
                totalTime,
                circuitLoadTime,
                verifyTime
            };
        } catch (error) {
            const totalEndTime = performance.now();
            const totalTime = totalEndTime - totalStartTime;
            console.error('Verification error:', (error as Error).message);
            return {
                isValid: false,
                totalTime,
                circuitLoadTime,
                verifyTime,
                error: (error as Error).message || (error as Error).toString()
            };
        }
    }
}

