import crypto from 'crypto';
import { Fr } from '@aztec/bb.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { formatHashResult, cleanHex } from '../common/hashUtils.js';

//hashing words and word-score pairs
export namespace HashService {
    function hashWord(word: string): string {
        const hash = crypto.createHash('sha256').update(word).digest('hex');
        return '0x' + hash;
    }

    export async function hashWordScore(word: string, score: number): Promise<string> {
        const wordHash = hashWord(word);
        const api = await barretenbergApi.getBarretenbergApi();
        const wordHashValue = barretenbergApi.hexToFieldValue(wordHash);
        const wordField = new Fr(wordHashValue);
        const scoreField = new Fr(BigInt(score));
        const hashResult = api.pedersenHash([wordField, scoreField], 0);
        return formatHashResult(hashResult);
    }

    //multiple word-score
    export async function hashWordScores(wordScores: Array<{ word: string; score: number }>): Promise<string[]> {
        const hashes: string[] = [];
        for (const { word, score } of wordScores) {
            const hash = await hashWordScore(word, score);
            hashes.push(hash);
        }
        return hashes;
    }

    export function hashWordForCircuit(word: string): string {
        return hashWord(word);
    }
}