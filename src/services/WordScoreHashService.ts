import crypto from 'crypto';
import { BarretenbergSync, Fr } from '@aztec/bb.js';

export class WordScoreHashService {
    private barretenbergApi: BarretenbergSync | null = null;
    private static readonly FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    
    private async getBarretenbergApi(): Promise<BarretenbergSync> {
        if (!this.barretenbergApi) {
            const { BarretenbergSync } = await import('@aztec/bb.js');
            this.barretenbergApi = await BarretenbergSync.initSingleton();
        }
        return this.barretenbergApi;
    }

    private hashWord(word: string): string {
        const hash = crypto.createHash('sha256').update(word).digest('hex');
        return '0x' + hash;
    }

    public async hashWordScore(word: string, score: number): Promise<string> {
        const wordHash = this.hashWord(word);
        const api = await this.getBarretenbergApi();
        const wordHashClean = wordHash.replace(/^0x/, '').toLowerCase();
        const wordHashValue = BigInt('0x' + wordHashClean) % WordScoreHashService.FIELD_MODULUS;
        const wordField = new Fr(wordHashValue);
        const scoreField = new Fr(BigInt(score));        
        const hashResult = api.pedersenHash([wordField, scoreField], 0);
        const rawResult = hashResult.toString();
        const cleanHex = rawResult.replace(/^0x/, '').toLowerCase();
        const hashValue = BigInt('0x' + cleanHex);
        const hexStr = hashValue.toString(16).toLowerCase();
        const paddedHex = hexStr.padStart(64, '0');
        return '0x' + paddedHex;
    }

    public async hashWordScores(wordScores: Array<{ word: string; score: number }>): Promise<string[]> {
        const hashes: string[] = [];
        for (const { word, score } of wordScores) {
            const hash = await this.hashWordScore(word, score);
            hashes.push(hash);
        }
        return hashes;
    }

    public hashWordForCircuit(word: string): string {
        return this.hashWord(word);
    }
}