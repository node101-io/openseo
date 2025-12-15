import { HashService } from '../prover/Hashing.js';
import { MerkleTreeBuilder } from './MerkleTreeBuilder.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { formatHashResult } from '../common/hashUtils.js';
import { Fr } from '@aztec/bb.js';
import { VerifierInput } from '../common/ProverTypes.js';
import { MAX_CHUNKS } from '../common/constants.js';

export namespace Verifier {
    export async function verify(verifierInput: VerifierInput): Promise<boolean> {
        const { keywordHash, htmlRoot, wordHashes, scores, isKeyword, chunkCount, expectedOccurrences } = verifierInput;

        // Validate inputs
        if (wordHashes.length && chunkCount && wordHashes.length > MAX_CHUNKS) {
            throw new Error(`Too many word hashes: ${wordHashes.length}. Maximum is ${MAX_CHUNKS}`);
        }
        const api = await barretenbergApi.getBarretenbergApi();
        const leafHashes: string[] = [];
        for (let i = 0; i < chunkCount; i++) {
            const wordHashValue = barretenbergApi.hexToFieldValue(wordHashes[i]);
            const wordField = new Fr(wordHashValue);
            const scoreField = new Fr(BigInt(scores[i]));
            const wordScoreHash = api.pedersenHash([wordField, scoreField], 0);
            const wordScoreHashHex = formatHashResult(wordScoreHash);
            leafHashes.push(wordScoreHashHex);
        }
        const calculatedMerkleRoot = await MerkleTreeBuilder.buildMerkleRoot(leafHashes);
        const keywordHashValue = barretenbergApi.hexToFieldValue(keywordHash);
        let found = 0;

        for (let i = 0; i < MAX_CHUNKS; i++) {
            const isInRange = i < chunkCount;
            const isKw = isKeyword[i] === 1;

            if (isInRange && isKw) {
                const wordHashValue = barretenbergApi.hexToFieldValue(wordHashes[i]);
                if (wordHashValue !== keywordHashValue) {
                    return false;
                }
                found++;
            }
        }

        if (found !== expectedOccurrences) {
            return false;
        }

        let currentRoot = new Fr(BigInt(0));
        for (let i = 0; i < MAX_CHUNKS; i++) {
            const isInRange = i < chunkCount;
            const isKw = isKeyword[i] === 1;

            if (isInRange && isKw) {
                const wordHashValue = barretenbergApi.hexToFieldValue(wordHashes[i]);
                const wordField = new Fr(wordHashValue);
                const scoreField = new Fr(BigInt(scores[i]));
                const wordScoreHash = api.pedersenHash([wordField, scoreField], 0);
                currentRoot = api.pedersenHash([currentRoot, wordScoreHash], 0);
            }
        }

        const calculatedHtmlRoot = formatHashResult(currentRoot);
        if (calculatedHtmlRoot.toLowerCase() !== htmlRoot.toLowerCase()) {
            return false;
        }

        return true;
    }
}