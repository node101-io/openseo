import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ProofResult, WordScorePair } from '../common/ProverTypes.js';
import { HashService } from './Hashing.js';
import { hashToNoirField, formatHashResult } from '../common/hashUtils.js';
import { sanitizeText, getTagId, getTagWeight } from '../common/textUtils.js';
import { MAX_WORDS } from '../common/constants.js';
import { HTMLParser, ParsedHTML } from '../common/HTMLParser.js';
import { 
    serializeToProverTomlV3, 
    serializeToProverTomlV4,
    CircuitInputsV3,
    CircuitInputsV4
} from '../common/tomlSerializer.js';
import { ProofVerifier } from '../verifier/ProofVerifier.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { Fr } from '@aztec/bb.js';

export interface FullProofResult extends ProofResult {
    htmlRoot: string;
    wordScorePairs: WordScorePair[];
    totalScore?: number;
}

export namespace CircuitProof {
    // Proof not score 
    async function buildCircuitDataV3(
        parsed: ParsedHTML,
        targetKeywords: string[]
    ): Promise<{ inputs: CircuitInputsV3; wordHashesForReturn: string[]; htmlRoot: string }> {
        const api = await barretenbergApi.getBarretenbergApi();
        const normalizedKeywords = targetKeywords.map(kw => sanitizeText(kw));
        const keywordSet = new Set(normalizedKeywords);

        const wordHashes: string[] = [];
        const isKeyword: number[] = [];
        const wordHashesForReturn: string[] = [];

        let i = 0;
        const words = parsed.words;

        while (i < words.length && wordHashes.length < MAX_WORDS) {
            const word = words[i];
            const isKw = keywordSet.has(word.word);

            if (isKw) {
                const hash = HashService.hashWordForCircuit(word.word);
                wordHashes.push(hashToNoirField(hash));
                isKeyword.push(1);
                wordHashesForReturn.push(hash);
                i++;
            } else {
                const chunkWords: string[] = [];
                let chunkIndex = i;
                while (chunkIndex < words.length && !keywordSet.has(words[chunkIndex].word) && wordHashes.length < MAX_WORDS) {
                    chunkWords.push(words[chunkIndex].word);
                    chunkIndex++;
                }
                const chunkText = chunkWords.join(' ');
                const hash = HashService.hashWordForCircuit(chunkText);
                wordHashes.push(hashToNoirField(hash));
                isKeyword.push(0);
                wordHashesForReturn.push(hash);
                i = chunkIndex;
            }
        }

        while (wordHashes.length < MAX_WORDS) {
            wordHashes.push('0x0');
            isKeyword.push(0);
        }

        const wordCount = wordHashes.filter(h => h !== '0x0').length;
        const keywordCount = isKeyword.filter((v, idx) => v === 1 && idx < wordCount).length;

        // Calculate html root
        let currentRoot = new Fr(BigInt(0));
        for (let idx = 0; idx < wordCount; idx++) {
            const hashValue = barretenbergApi.hexToFieldValue(wordHashes[idx]);
            const hashField = new Fr(hashValue);
            currentRoot = api.pedersenHash([currentRoot, hashField], 0);
        }

        return {
            inputs: {
                keywordCount,
                isKeyword,
                wordHashes,
                wordCount,
                htmlRoot: hashToNoirField(formatHashResult(currentRoot))
            },
            wordHashesForReturn,
            htmlRoot: hashToNoirField(formatHashResult(currentRoot))
        };
    }

    // Proof with score -> V4
    async function buildCircuitWithScore(
        parsed: ParsedHTML,
        targetKeywords: string[]
    ): Promise<{ inputs: CircuitInputsV4; wordHashesForReturn: string[]; htmlRoot: string; totalScore: number }> {
        const api = await barretenbergApi.getBarretenbergApi();
        const normalizedKeywords = targetKeywords.map(kw => sanitizeText(kw));
        const keywordSet = new Set(normalizedKeywords);

        const wordHashes: string[] = [];
        const isKeyword: number[] = [];
        const tagIds: number[] = [];
        const wordHashesForReturn: string[] = [];

        let i = 0;
        const words = parsed.words;

        while (i < words.length && wordHashes.length < MAX_WORDS) {
            const word = words[i];
            const isKw = keywordSet.has(word.word);

            if (isKw) {
                const hash = HashService.hashWordForCircuit(word.word);
                wordHashes.push(hashToNoirField(hash));
                isKeyword.push(1);
                tagIds.push(getTagId(word.tag));
                wordHashesForReturn.push(hash);
                i++;
            } else {
                const chunkWords: string[] = [];
                let chunkIndex = i;
                while (chunkIndex < words.length && !keywordSet.has(words[chunkIndex].word) && wordHashes.length < MAX_WORDS) {
                    chunkWords.push(words[chunkIndex].word);
                    chunkIndex++;
                }
                const chunkText = chunkWords.join(' ');
                const hash = HashService.hashWordForCircuit(chunkText);
                wordHashes.push(hashToNoirField(hash));
                isKeyword.push(0);
                tagIds.push(0);
                wordHashesForReturn.push(hash);
                i = chunkIndex;
            }
        }

        while (wordHashes.length < MAX_WORDS) {
            wordHashes.push('0x0');
            isKeyword.push(0);
            tagIds.push(0);
        }

        const wordCount = wordHashes.filter(h => h !== '0x0').length;
        const keywordCount = isKeyword.filter((v, idx) => v === 1 && idx < wordCount).length;

        // Calculate total score and HTML root for v4
        let currentRoot = new Fr(BigInt(0));
        let totalScore = 0;

        for (let idx = 0; idx < wordCount; idx++) {
            const hashValue = barretenbergApi.hexToFieldValue(wordHashes[idx]);
            const hashField = new Fr(hashValue);

            if (isKeyword[idx] === 1) {
                const weight = getTagWeight(words.find((_, wi) => {
                    // Find the original word index that corresponds to this wordHash position
                    let count = 0;
                    for (let j = 0; j <= wi && j < words.length; j++) {
                        if (keywordSet.has(words[j].word)) count++;
                        else {
                            // Skip chunks
                            let chunkEnd = j;
                            while (chunkEnd < words.length && !keywordSet.has(words[chunkEnd].word)) chunkEnd++;
                            if (chunkEnd > j + 1) j = chunkEnd - 1;
                        }
                    }
                    return count === idx + 1;
                })?.tag || 'default');
                
                // Actually, use tagIds which we already calculated
                const tagIdForWeight = tagIds[idx];
                const weightFromId = getWeightFromTagId(tagIdForWeight);
                totalScore += weightFromId;

                const weightField = new Fr(BigInt(weightFromId));
                const wordScoreHash = api.pedersenHash([hashField, weightField], 0);
                currentRoot = api.pedersenHash([currentRoot, wordScoreHash], 0);
            } else {
                currentRoot = api.pedersenHash([currentRoot, hashField], 0);
            }
        }

        return {
            inputs: {
                keywordCount,
                isKeyword,
                wordHashes,
                tagIds,
                wordCount,
                htmlRoot: hashToNoirField(formatHashResult(currentRoot)),
                totalScore
            },
            wordHashesForReturn,
            htmlRoot: hashToNoirField(formatHashResult(currentRoot)),
            totalScore
        };
    }

    function getWeightFromTagId(tagId: number): number {
        const weights: Record<number, number> = {
            0: 1, 1: 12, 2: 10, 3: 8, 4: 6, 5: 5, 6: 4, 7: 3,
            8: 7, 9: 5, 10: 5, 11: 4, 12: 6, 13: 3, 14: 2, 15: 2,
            16: 3, 17: 2, 18: 4, 19: 3, 20: 3
        };
        return weights[tagId] ?? 1;
    }

    export async function generateProof(
        htmlContent: string,
        keywords: string[],
        version: 'v3' | 'v4' = 'v3'
    ): Promise<FullProofResult> {
        const normalizedKeywords = keywords.map(k => sanitizeText(k)).filter(k => k.length > 0);
        if (normalizedKeywords.length === 0) {
            throw new Error('At least one keyword is required');
        }
        const parsed = HTMLParser.parse(htmlContent);

        const occurrenceMap = HTMLParser.findKeywordOccurrences(parsed, normalizedKeywords);
        const wordScorePairs: WordScorePair[] = [];

        for (const keyword of normalizedKeywords) {
            const data = occurrenceMap.get(keyword);
            if (!data || data.occurrences === 0) {
                throw new Error(`Keyword "${keyword}" not found in HTML`);
            }
            wordScorePairs.push({
                word: keyword,
                score: HTMLParser.calculateKeywordScore(data.weights)
            });
        }

        try {
            const circuitDir = path.join(process.cwd(), 'circuits', version);
            
            if (version === 'v4') {
                const { inputs, wordHashesForReturn, htmlRoot, totalScore } = await buildCircuitWithScore(parsed, normalizedKeywords);
                fs.writeFileSync(
                    path.join(circuitDir, 'Prover.toml'),
                    serializeToProverTomlV4(inputs, { keywords: normalizedKeywords })
                );
                
                execSync('nargo compile', { cwd: circuitDir, stdio: 'pipe' });
                execSync('nargo execute', { cwd: circuitDir, stdio: 'pipe' });

                const targetDir = path.join(process.cwd(), 'target');
                const circuitPath = path.join(targetDir, `${version}.json`);
                const witnessPath = path.join(targetDir, `${version}.gz`);
                const proofDir = path.join(targetDir, 'proof');

                if (fs.existsSync(proofDir)) fs.rmSync(proofDir, { recursive: true, force: true });

                execSync(`bb prove -b "${circuitPath}" -w "${witnessPath}" -o "${proofDir}" --write_vk`, {
                    cwd: process.cwd(), stdio: 'pipe'
                });

                const proofData = fs.readFileSync(path.join(proofDir, 'proof'));
                const proofPackage = {
                    proof_type: 'zk_snark_proof_v4',
                    proof_file_path: path.join(proofDir, 'proof'),
                    verification_key_path: path.join(proofDir, 'vk'),
                    public_inputs: { html_root: htmlRoot, total_score: totalScore }
                };

                return {
                    proof: Buffer.from(JSON.stringify(proofPackage)).toString('base64'),
                    publicInputs: JSON.stringify(proofPackage.public_inputs),
                    wordHashes: wordHashesForReturn,
                    success: true,
                    proofSize: proofData.length,
                    htmlRoot,
                    wordScorePairs,
                    totalScore
                };
            } else {
                // V3
                const { inputs, wordHashesForReturn, htmlRoot } = await buildCircuitDataV3(parsed, normalizedKeywords);
                fs.writeFileSync(
                    path.join(circuitDir, 'Prover.toml'),
                    serializeToProverTomlV3(inputs, { keywords: normalizedKeywords })
                );

                execSync('nargo compile', { cwd: circuitDir, stdio: 'pipe' });
                execSync('nargo execute', { cwd: circuitDir, stdio: 'pipe' });

                const targetDir = path.join(process.cwd(), 'target');
                const circuitPath = path.join(targetDir, `${version}.json`);
                const witnessPath = path.join(targetDir, `${version}.gz`);
                const proofDir = path.join(targetDir, 'proof');

                if (fs.existsSync(proofDir)) fs.rmSync(proofDir, { recursive: true, force: true });

                execSync(`bb prove -b "${circuitPath}" -w "${witnessPath}" -o "${proofDir}" --write_vk`, {
                    cwd: process.cwd(), stdio: 'pipe'
                });

                const proofData = fs.readFileSync(path.join(proofDir, 'proof'));
                const proofPackage = {
                    proof_type: 'zk_snark_proof_v3',
                    proof_file_path: path.join(proofDir, 'proof'),
                    verification_key_path: path.join(proofDir, 'vk'),
                    public_inputs: { html_root: htmlRoot }
                };

                return {
                    proof: Buffer.from(JSON.stringify(proofPackage)).toString('base64'),
                    publicInputs: JSON.stringify(proofPackage.public_inputs),
                    wordHashes: wordHashesForReturn,
                    success: true,
                    proofSize: proofData.length,
                    htmlRoot,
                    wordScorePairs
                };
            }
        } catch (error) {
            console.error('Proof generation failed:', (error as Error).message);
            return {
                success: false,
                proof: '',
                publicInputs: '',
                wordHashes: [],
                proofSize: 0,
                error: (error as Error).message,
                htmlRoot: '',
                wordScorePairs
            };
        }
    }

    export const verifyProof = ProofVerifier.verifyProof;
}