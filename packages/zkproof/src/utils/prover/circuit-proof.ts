import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProofResult } from '../common/prover-types.js';
import { HashService } from './hashing.js';
import { hashToNoirField } from '../common/hash-utils.js';
import { sanitizeText, getTagId } from '../common/text-utils.js';
import { MASK_WORDS, MAX_WORDS } from '../common/constants.js';
import { HTMLParser, ParsedHTML } from '../common/html-parser.js';
import { ProofVerifier } from '../verifier/proof-verifier.js';
import { Noir } from '@noir-lang/noir_js';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ZKPROOF_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface FullProofResult extends ProofResult {
    htmlRoot: string;
    keywordScores: { keyword: string; score: number }[];
    totalScore: number;
    rawKeywordScores: number[];
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

    function getTagWeightForCircuit(tagId: number): number {
        if (tagId === 1) return 12;       // title 
        if (tagId === 2) return 10;       // h1
        if (tagId === 3) return 8;        // h2
        if (tagId === 4) return 6;        // h3
        if (tagId === 5) return 5;        // h4
        if (tagId === 6) return 4;        // h5
        if (tagId === 7) return 3;        // h6
        if (tagId === 8) return 7;        // meta
        if (tagId === 9) return 5;        // strong
        if (tagId === 10) return 5;       // b
        if (tagId === 11) return 4;       // i
        if (tagId === 12) return 6;       // a
        if (tagId === 13) return 3;       // p
        if (tagId === 14) return 2;       // span
        if (tagId === 15) return 2;       // div
        if (tagId === 16) return 3;       // li
        if (tagId === 17) return 2;       // td
        if (tagId === 18) return 4;       // th
        if (tagId === 19) return 3;       // blockquote
        if (tagId === 20) return 3;       // code
        return 1;                         // default
    }

    async function buildCircuitData(
        parsed: ParsedHTML,
        targetKeywords: string[]
    ): Promise<{ inputs: any; wordHashesForReturn: string[]; foundKeywordsList: string[] }> {
        const normalizedKeywords = targetKeywords.map(kw => sanitizeText(kw));
        const keywordSet = new Set(normalizedKeywords);
        const wordHashes: string[] = [];
        const isKeywordHex: string[] = new Array(MASK_WORDS).fill('0x00000000');
        const tagIds: number[] = [];
        const wordHashesForReturn: string[] = [];
        const foundKeywordsList: string[] = [];

        let i = 0;
        const words = parsed.words;
        let wordIndex = 0;

        function setBit(hexMask: string[], globalPos: number): void {
            const wordIdx = Math.floor(globalPos / 32);
            const bitIdx  = globalPos % 32;
            const u32     = parseInt(hexMask[wordIdx], 16) | (1 << bitIdx);
            hexMask[wordIdx] = '0x' + (u32 >>> 0).toString(16).padStart(8, '0');
        }
        while (i < words.length && wordHashes.length < MAX_WORDS) {
            const word = words[i];
            const isKw = keywordSet.has(word.word);

            if (isKw) {
                foundKeywordsList.push(word.word);
                const hash = HashService.hashWordForCircuit(word.word);
                wordHashes.push(hashToNoirField(hash));
                setBit(isKeywordHex, wordIndex);
                const tId = getTagId(word.tag);
                tagIds.push(tId);
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
        const keywordPositions: number[] = [];
        
        for (let idx = 0; idx < wordCount; idx++) {
            const wordIdx = Math.floor(idx / 32);
            const bitIdx  = idx % 32;
            const u32 = Number(BigInt.asUintN(32, BigInt(isKeywordHex[wordIdx])));
            const bitIsSet = (u32 >>> bitIdx) & 1;
            if (bitIsSet === 1) {
                keywordPositions.push(idx);
            }
        }

        const keywordPositionsPadded: number[] = [...keywordPositions];
        
        while (keywordPositionsPadded.length < MAX_WORDS) {
            keywordPositionsPadded.push(0);
        }

        const keywordCount = keywordPositions.length;
        const noirInputs = {
            keyword_count: keywordCount,
            is_keyword: isKeywordHex,
            keyword_positions: keywordPositionsPadded,
            word_hashes: wordHashes,
            tag_ids: tagIds,
            word_count: wordCount
        };

        return {
            inputs: noirInputs,
            wordHashesForReturn,
            foundKeywordsList
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

        try {
            const { inputs, wordHashesForReturn, foundKeywordsList } = await buildCircuitData(parsed, normalizedKeywords);
            const circuitPath = path.join(ZKPROOF_ROOT, 'target', 'zkseo.json');

            if (!fs.existsSync(circuitPath)) {
                throw new Error(`Circuit file not found. Run 'nargo compile'.`);
            }

            const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
            const api = await Barretenberg.new({ threads: os.cpus().length });
            const honkBackend = new UltraHonkBackend(circuit.bytecode, api);
            const noir = new Noir(circuit);
            
            const { witness } = await noir.execute(inputs);
            const { proof, publicInputs } = await honkBackend.generateProof(witness);

            const realHtmlRoot = publicInputs[0]?.toString() || '0x00';
            const realTotalScore = parseInt(publicInputs[1]?.toString().replace('0x', ''), 16);

            const rawKeywordScores: number[] = [];
            for (let j = 0; j < MAX_WORDS; j++) {
                const scoreHex = publicInputs[2 + j] || '0x00';
                rawKeywordScores.push(parseInt(scoreHex.toString().replace('0x', ''), 16));
            }
            
            const groupedScoresMap = new Map<string, number>();
            for (let j = 0; j < foundKeywordsList.length; j++) {
                const kw = foundKeywordsList[j];
                const score = rawKeywordScores[j];
                groupedScoresMap.set(kw, (groupedScoresMap.get(kw) || 0) + score);
            }

            const verifiedKeywordScores = Array.from(groupedScoresMap.entries()).map(([keyword, score]) => ({
                keyword,
                score
            }));

            const vk = typeof honkBackend.getVerificationKey === 'function' ? await honkBackend.getVerificationKey() : new Uint8Array(0);

            const proofPackage = {
                proof_type: 'ultra_honk', 
                proof: Array.from(proof),
                vk: Array.from(vk),
                public_inputs: { 
                    html_root: realHtmlRoot, 
                    total_score: realTotalScore,
                    raw_keyword_scores: rawKeywordScores
                }
            };

            return {
                proof: Buffer.from(JSON.stringify(proofPackage)).toString('base64'),
                publicInputs: JSON.stringify(proofPackage.public_inputs),
                wordHashes: wordHashesForReturn,
                success: true,
                proofSize: proof.length,
                htmlRoot: realHtmlRoot,
                keywordScores: verifiedKeywordScores,
                totalScore: realTotalScore,
                rawKeywordScores,
            };

        } catch (error) {
            console.error('[Proof] Generation failed:', error);
            return {
                success: false, proof: '', publicInputs: '', wordHashes: [],
                proofSize: 0, error: String(error), htmlRoot: '',
                keywordScores: [], totalScore: 0
                , rawKeywordScores: []
            };
        }
    }

    export async function generateHtmlRoot(
        htmlContent: string,
        keywords: string[]
    ): Promise<{ htmlRoot: string; totalScore: number; success: boolean }> {
        const result = await generateProof(htmlContent, keywords);
        return {
            htmlRoot: result.htmlRoot || '0x00',
            totalScore: result.totalScore || 0,
            success: result.success
        };
    }

    export const verifyProof = ProofVerifier.verifyProof;
}