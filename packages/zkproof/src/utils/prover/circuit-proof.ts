import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProofResult, WordScorePair } from '../common/prover-types.js';
import { HashService } from './Hashing.js';
import { hashToNoirField } from '../common/hash-utils.js';
import { sanitizeText, getTagId } from '../common/text-utils.js';
import { MAX_WORDS } from '../common/constants.js';
import { HTMLParser, ParsedHTML } from '../common/html-parser.js';
import { ProofVerifier } from '../verifier/proof-verifier.js';
import { Noir } from '@noir-lang/noir_js';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ZKPROOF_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface FullProofResult extends ProofResult {
    htmlRoot: string;
    wordScorePairs: WordScorePair[];
    totalScore: number;
}

export namespace CircuitProof {
    async function loadBB() {
        const bbImport = await import('@aztec/bb.js');
        const bb = (bbImport as any).default || bbImport;
        return {
            Barretenberg: bb.Barretenberg,
            UltraHonkBackend: bb.UltraHonkBackend
        };
    }

    async function buildCircuitData(
        parsed: ParsedHTML,
        targetKeywords: string[]
    ): Promise<{ inputs: any; wordHashesForReturn: string[] }> {
        
        const normalizedKeywords = targetKeywords.map(kw => sanitizeText(kw));
        const keywordSet = new Set(normalizedKeywords);
        const wordHashes: string[] = [];
        let isKeywordBitmask = 0;
        const tagIds: number[] = [];
        const wordHashesForReturn: string[] = [];

        let i = 0;
        const words = parsed.words;
        let wordIndex = 0;

        while (i < words.length && wordHashes.length < MAX_WORDS) {
            const word = words[i];
            const isKw = keywordSet.has(word.word);

            if (isKw) {
                const hash = HashService.hashWordForCircuit(word.word);
                wordHashes.push(hashToNoirField(hash));
                const bitToSet = 1 << wordIndex;
                isKeywordBitmask |= bitToSet;
                tagIds.push(getTagId(word.tag));
                wordHashesForReturn.push(hash);
                i++;
                wordIndex++;
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
                tagIds.push(0); 
                wordHashesForReturn.push(hash);
                i = chunkIndex;
                wordIndex++;
            }
        }

        while (wordHashes.length < MAX_WORDS) {
            wordHashes.push('0x0');
            tagIds.push(0);
        }

        const wordCount = wordHashes.filter(h => h !== '0x0').length;
        let keywordCount = 0;
        const keywordPositions: number[] = [];
        
        for (let idx = 0; idx < wordCount; idx++) {
            const bitIsSet = (isKeywordBitmask >> idx) & 1;
            if (bitIsSet === 1) {
                keywordCount++;
                keywordPositions.push(idx);
            }
        }

        const keywordPositionsPadded: number[] = [...keywordPositions];
        while (keywordPositionsPadded.length < MAX_WORDS) {
            keywordPositionsPadded.push(0);
        }

        const noirInputs = {
            keyword_count: keywordCount,
            is_keyword: isKeywordBitmask,
            keyword_positions: keywordPositionsPadded,
            word_hashes: wordHashes,
            tag_ids: tagIds,
            word_count: wordCount
        };

        return {
            inputs: noirInputs,
            wordHashesForReturn
        };
    }

    export async function generateProof(
        htmlContent: string,
        keywords: string[]
    ): Promise<FullProofResult> {
        const { Barretenberg, UltraHonkBackend } = await loadBB();
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
            const { inputs, wordHashesForReturn } = await buildCircuitData(parsed, normalizedKeywords);
            const circuitPath = path.join(ZKPROOF_ROOT, 'target', 'zkseo.json');

            if (!fs.existsSync(circuitPath)) {
                throw new Error(`Circuit file not found at ${circuitPath}. Please run 'nargo compile' first.`);
            }

            const circuitContent = fs.readFileSync(circuitPath, 'utf-8');
            const circuit = JSON.parse(circuitContent);
            const threads = os.cpus().length;
            const api = await Barretenberg.new({ threads });
            const honkBackend = new UltraHonkBackend(circuit.bytecode, api);
            const noir = new Noir(circuit);
            const { witness } = await noir.execute(inputs);
            const { proof, publicInputs } = await honkBackend.generateProof(witness);
            const realHtmlRoot = publicInputs[0] || '0x00';
            const realTotalScoreHex = publicInputs[1] || '0x00';
            const realTotalScore = parseInt(realTotalScoreHex.replace('0x', ''), 16);

            let vk: Uint8Array;
            if (typeof honkBackend.getVerificationKey === 'function') {
                vk = await honkBackend.getVerificationKey();
            } else {
                vk = new Uint8Array(0);
            }

            const proofPackage = {
                proof_type: 'ultra_honk', 
                proof_file_path: 'in_memory',
                verification_key_path: 'in_memory',
                proof: Array.from(proof),
                vk: Array.from(vk),
                public_inputs_raw: [], 
                public_inputs: { 
                    html_root: realHtmlRoot.toString(), 
                    total_score: realTotalScore 
                }
            };

            return {
                proof: Buffer.from(JSON.stringify(proofPackage)).toString('base64'),
                publicInputs: JSON.stringify(proofPackage.public_inputs),
                wordHashes: wordHashesForReturn,
                success: true,
                proofSize: proof.length,
                htmlRoot: realHtmlRoot.toString(),
                wordScorePairs,
                totalScore: realTotalScore
            };

        } catch (error) {
            console.error('[Proof] Generation failed:', error);
            return {
                success: false,
                proof: '',
                publicInputs: '',
                wordHashes: [],
                proofSize: 0,
                error: String(error),
                htmlRoot: '',
                wordScorePairs,
                totalScore: 0
            };
        }
    }

    export async function generateHtmlRoot(
        htmlContent: string,
        keywords: string[]
    ): Promise<{ htmlRoot: string; totalScore: number; success: boolean }> {
        try {
            const result = await generateProof(htmlContent, keywords);
            if (!result.success) {
                throw new Error(result.error || "Proof generation failed internally");
            }
            return {
                htmlRoot: result.htmlRoot,
                totalScore: result.totalScore,
                success: true
            };
        }
        catch (error) {
            console.error("Node root calculation failed:", error);
            return {
                htmlRoot: '0x00',
                totalScore: 0,
                success: false
            };
        }

        /*return {
            htmlRoot: '0x00',
            totalScore: 0,
            success: true
        };*/
    }

    export const verifyProof = ProofVerifier.verifyProof;
}