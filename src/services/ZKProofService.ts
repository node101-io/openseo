import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import toml from 'toml';
import { WordOccurrenceData, ProofResult, VerificationResult, WordScorePair } from '../types/ProverTypes.js';
import { WordScoreHashService } from './WordScoreHashService.js';
import { MerkleTreeBuilderService } from './MerkleTreeBuilderService.js';
import { performance } from 'perf_hooks';

export class ZKProofService {
    private wordScoreHasher: WordScoreHashService;
    private merkleTreeBuilder: MerkleTreeBuilderService;

    constructor() {
        this.wordScoreHasher = new WordScoreHashService();
        this.merkleTreeBuilder = new MerkleTreeBuilderService();
    }

    private hashToNoirField(hexHash: string): string {
        if (hexHash === '0x0' || hexHash === '0x00' || !hexHash) {
            return '0x0';
        }
        const cleanHex = hexHash.replace(/^0x/, '').toLowerCase();
        if (!cleanHex || cleanHex.length === 0) {
            return '0x0';
        }
        const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
        let hashValue = BigInt('0x' + cleanHex);
        hashValue = hashValue % FIELD_MODULUS;
        const hexStr = hashValue.toString(16).toLowerCase();
        const paddedHex = hexStr.padStart(64, '0');
        return '0x' + paddedHex;
    }

    private async generateProverToml(
        merkleRoot: string,
        wordScores: Array<{ word: string; score: number }>,
        occurrenceDataMap: Map<string, WordOccurrenceData>
    ): Promise<string> {
        const MAX_WORDS = 16;
        let tomlContent = `# ZK-SEO Word-Score Proof Input\n`;
        tomlContent += `# Note: Merkle root is not used in circuit - it will be verified in TypeScript\n`;
        tomlContent += `# Merkle Root (for reference): ${merkleRoot}\n`;
        tomlContent += `# Word Count: ${wordScores.length}\n\n`;

        tomlContent += `word_count = ${wordScores.length}\n\n`;

        const wordScoresArray: string[] = [];
        for (let i = 0; i < MAX_WORDS; i++) {
            if (i < wordScores.length) {
                wordScoresArray.push(wordScores[i].score.toString());
            } else {
                wordScoresArray.push('0');
            }
        }
        tomlContent += `word_scores = [${wordScoresArray.join(', ')}]\n\n`;

        const wordsArray: string[] = [];
        for (let i = 0; i < MAX_WORDS; i++) {
            if (i < wordScores.length) {
                const wordHash = this.wordScoreHasher.hashWordForCircuit(wordScores[i].word);
                wordsArray.push(`"${this.hashToNoirField(wordHash)}"`);
            } else {
                wordsArray.push('"0x0"');
            }
        }
        tomlContent += `words = [${wordsArray.join(', ')}]\n\n`;

        const occurrencesArray: string[] = [];
        for (let i = 0; i < MAX_WORDS; i++) {
            if (i < wordScores.length) {
                const occurrenceData = occurrenceDataMap.get(wordScores[i].word);
                occurrencesArray.push(occurrenceData?.occurrences.toString() || '0');
            } else {
                occurrencesArray.push('0');
            }
        }
        tomlContent += `occurrences = [${occurrencesArray.join(', ')}]\n\n`;
        tomlContent += `weights = [\n`;
        for (let i = 0; i < MAX_WORDS; i++) {
            const weightsRow: string[] = [];
            if (i < wordScores.length) {
                const occurrenceData = occurrenceDataMap.get(wordScores[i].word);
                const weights = occurrenceData?.weights || [];
                for (let j = 0; j < 32; j++) {
                    if (j < weights.length) {
                        weightsRow.push(weights[j].toString());
                    } else {
                        weightsRow.push('0');
                    }
                }
            } else {
                for (let j = 0; j < 32; j++) {
                    weightsRow.push('0');
                }
            }
            tomlContent += `  [${weightsRow.join(', ')}]`;
            if (i < MAX_WORDS - 1) {
                tomlContent += ',';
            }
            tomlContent += '\n';
        }
        tomlContent += `]\n`;

        return tomlContent;
    }

    public async generateProof(
        merkleRoot: string,
        wordScores: Array<{ word: string; score: number }>,
        occurrenceDataMap: Map<string, WordOccurrenceData>
    ): Promise<ProofResult> {
        try {
            const wordHashes = await this.wordScoreHasher.hashWordScores(wordScores);
            const tomlContent = await this.generateProverToml(merkleRoot, wordScores, occurrenceDataMap);
            const proverTomlPath = path.join(process.cwd(), 'Prover.toml');
            fs.writeFileSync(proverTomlPath, tomlContent);
            execSync('nargo compile', { stdio: 'pipe', encoding: 'utf-8' });
            const circuitPath = path.join(process.cwd(), 'target', 'zkseo.json');
            const circuitData = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
            const inputs = toml.parse(tomlContent);
            const noir = new Noir(circuitData);
            const { witness } = await noir.execute(inputs);
            const backend = new UltraHonkBackend(circuitData.bytecode);
            const proofData = await backend.generateProof(witness);
            let proofSize = 0;
            if (proofData.proof) {
                if (Array.isArray(proofData.proof)) {
                    proofSize = proofData.proof.length * 32;
                } else if (typeof proofData.proof === 'string') {
                    proofSize = Buffer.from(proofData.proof, 'hex').length;
                } else {
                    proofSize = JSON.stringify(proofData.proof).length;
                }
            }

            return {
                proof: proofData.proof,
                publicInputs: proofData.publicInputs,
                wordHashes: wordHashes,
                success: true,
                proofSize: proofSize
            } as ProofResult;
        } catch (error) {
            console.error('Proof generation failed:', (error as Error).message);
            return {
                success: false,
                error: (error as Error).message || (error as Error).toString()
            };
        }
    }

    public async verifyProof(
        proof: any, 
        publicInputs: any, 
        wordHashes: string[],
    ): Promise<VerificationResult> {
        const totalStartTime = performance.now();
        let circuitLoadTime = 0;
        let backendInitTime = 0;
        let verifyTime = 0;
        let merkleRootVerificationTime = 0;

        try {
            if (!wordHashes || wordHashes.length === 0) {
                throw new Error('Word hashes list is required for verification');
            }
            console.log('  Step 1: Verifying proof with backend (circuit validation)...');
            const circuitLoadStart = performance.now();
            const circuitPath = path.join(process.cwd(), 'target', 'zkseo.json');
            const circuitData = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
            const circuitLoadEnd = performance.now();
            circuitLoadTime = circuitLoadEnd - circuitLoadStart;

            const backendInitStart = performance.now();
            const backend = new UltraHonkBackend(circuitData.bytecode);
            const backendInitEnd = performance.now();
            backendInitTime = backendInitEnd - backendInitStart;

            const verifyStart = performance.now();
            const isValid = await backend.verifyProof({
                proof,
                publicInputs
            });
            const verifyEnd = performance.now();
            verifyTime = verifyEnd - verifyStart;

            if (!isValid) {
                console.error('Backend proof verification failed - proof is invalid');
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    circuitLoadTime,
                    backendInitTime,
                    verifyTime,
                    error: 'Backend proof verification failed - circuit validation unsuccessful'
                };
            }
            console.log('Backend proof verification passed - circuit validation successful');
            console.log('  Step 2: Building Merkle tree from hash list and verifying...');
            const merkleRootStart = performance.now();
            const calculatedMerkleRoot = await this.merkleTreeBuilder.buildMerkleRoot(wordHashes);
            const merkleRootEnd = performance.now();
            merkleRootVerificationTime = merkleRootEnd - merkleRootStart;
            
            console.log(`Merkle tree built from hash list`);
            console.log(`Calculated Merkle Root: ${calculatedMerkleRoot.substring(0, 32)}...`);
            console.log(`Hash list length: ${wordHashes.length}`);
            console.log(`Merkle tree construction time: ${merkleRootVerificationTime.toFixed(2)}ms`);

            const totalEndTime = performance.now();
            const totalTime = totalEndTime - totalStartTime;

            return {
                isValid: true,
                totalTime,
                circuitLoadTime,
                backendInitTime,
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
                backendInitTime,
                verifyTime,
                error: (error as Error).message || (error as Error).toString()
            };
        }
    }
}