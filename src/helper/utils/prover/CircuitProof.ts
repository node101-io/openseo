import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ProofResult, WordScorePair } from '../common/ProverTypes.js';
import { HashService } from './Hashing.js';
import { hashToNoirField, formatHashResult } from '../common/hashUtils.js';
import { sanitizeText } from '../common/textUtils.js';
import { MAX_WORDS } from '../common/constants.js';
import { HTMLParser, ParsedHTML } from '../common/HTMLParser.js';
import { serializeToProverToml, CircuitInputs } from '../common/tomlSerializer.js';
import { ProofVerifier } from '../verifier/ProofVerifier.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { Fr } from '@aztec/bb.js';

export interface FullProofResult extends ProofResult {
    htmlRoot: string;
    wordScorePairs: WordScorePair[];
}

export namespace CircuitProof {
    async function buildCircuitData(
        parsed: ParsedHTML,
        targetKeywords: string[]
    ): Promise<{ inputs: CircuitInputs; wordHashesForReturn: string[]; htmlRoot: string }> {
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
                
                while (chunkIndex < words.length &&
                       !keywordSet.has(words[chunkIndex].word) &&
                       wordHashes.length < MAX_WORDS) {
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
        
        // Pad to MAX_WORDS
        while (wordHashes.length < MAX_WORDS) {
            wordHashes.push('0x0');
            isKeyword.push(0);
        }

        const wordCount = wordHashes.filter(h => h !== '0x0').length;
        const keywordCount = isKeyword.filter((v, idx) => v === 1 && idx < wordCount).length;

        // Calculate HTML root: H(H(H(0, h1), h2), h3)...
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

    export async function generateProof(
        htmlContent: string,
        keywords: string[]
    ): Promise<FullProofResult> {
        const normalizedKeywords = keywords.map(k => sanitizeText(k)).filter(k => k.length > 0);
        if (normalizedKeywords.length === 0) {
            throw new Error('At least one keyword is required');
        }
        const parsed = HTMLParser.parse(htmlContent);

        // Find keyword occurrences and calculate scores
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
            // Build circuit data
            const { inputs, wordHashesForReturn, htmlRoot } = await buildCircuitData(parsed, normalizedKeywords);
            
            // Write Prover.toml
            const circuitDir = path.join(process.cwd(), 'circuits', 'v3');
            fs.writeFileSync(
                path.join(circuitDir, 'Prover.toml'),
                serializeToProverToml(inputs, { keywords: normalizedKeywords })
            );

            execSync('nargo compile', { cwd: circuitDir, stdio: 'pipe' });
            execSync('nargo execute', { cwd: circuitDir, stdio: 'pipe' });

            // Generate proof
                const targetDir = path.join(process.cwd(), 'target');
            const circuitPath = path.join(targetDir, 'v3.json');
            const witnessPath = path.join(targetDir, 'v3.gz');
                const proofDir = path.join(targetDir, 'proof');
                
                if (fs.existsSync(proofDir)) {
                    fs.rmSync(proofDir, { recursive: true, force: true });
                }
                
            execSync(`bb prove -b "${circuitPath}" -w "${witnessPath}" -o "${proofDir}" --write_vk`, {
                    cwd: process.cwd(),
                stdio: 'pipe'
            });

            const proofFilePath = path.join(proofDir, 'proof');
                    const proofData = fs.readFileSync(proofFilePath);

            const proofPackage = {
                proof_type: 'zk_snark_proof_generated',
                proof_file_path: proofFilePath,
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