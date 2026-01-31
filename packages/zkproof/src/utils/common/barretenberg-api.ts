import { BarretenbergSync } from '@aztec/bb.js';
import { FIELD_MODULUS } from './constants.js';
import { formatHashResult, cleanHex } from './hash-utils.js';

class BarretenbergApi {
    private barretenbergApi: BarretenbergSync | null = null;

    async getBarretenbergApi(): Promise<BarretenbergSync> {
        if (!this.barretenbergApi) {
            const { BarretenbergSync } = await import('@aztec/bb.js');
            this.barretenbergApi = await BarretenbergSync.initSingleton();
        }
        return this.barretenbergApi;
    }

    hexToFieldValue(hex: string): bigint {
        const clean = cleanHex(hex);
        if (!clean || clean.length === 0) {
            return BigInt(0);
        }
        return BigInt('0x' + clean) % FIELD_MODULUS;
    }

    formatHash(result: any): string {
        return formatHashResult(result);
    }
}

export const barretenbergApi = new BarretenbergApi();