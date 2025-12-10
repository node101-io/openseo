import { BarretenbergSync, Fr } from '@aztec/bb.js';

export class MerkleTreeBuilderService {
    private static readonly FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    private static readonly MAX_LEAVES = 16; 
    private static readonly MAX_LEVELS = 4; 
    private barretenbergApi: BarretenbergSync | null = null;

    private async getBarretenbergApi(): Promise<BarretenbergSync> {
        if (!this.barretenbergApi) {
            const { BarretenbergSync } = await import('@aztec/bb.js');
            this.barretenbergApi = await BarretenbergSync.initSingleton();
        }
        return this.barretenbergApi;
    }

    private hashToField(hexHash: string): Fr {
        const cleanHex = hexHash.replace(/^0x/, '').toLowerCase();
        if (!cleanHex || cleanHex.length === 0) {
            return new Fr(0n);
        }
        const hashValue = BigInt('0x' + cleanHex) % MerkleTreeBuilderService.FIELD_MODULUS;
        return new Fr(hashValue);
    }

    private padHashes(hashes: string[]): string[] {
        const padded = [...hashes];
        while (padded.length < MerkleTreeBuilderService.MAX_LEAVES) {
            padded.push('0x0');
        }
        return padded.slice(0, MerkleTreeBuilderService.MAX_LEAVES);
    }

    public async buildMerkleRoot(leafHashes: string[]): Promise<string> {
        if (leafHashes.length === 0) {
            return '0x0';
        }

        if (leafHashes.length > MerkleTreeBuilderService.MAX_LEAVES) {
            throw new Error(
                `Too many leaves: ${leafHashes.length}. Maximum is ${MerkleTreeBuilderService.MAX_LEAVES}`
            );
        }

        if (leafHashes.length === 1) {
            const singleHash = leafHashes[0];
            const cleanHex = singleHash.replace(/^0x/, '').toLowerCase();
            if (!cleanHex || cleanHex.length === 0) {
                return '0x0';
            }
            const hashValue = BigInt('0x' + cleanHex) % MerkleTreeBuilderService.FIELD_MODULUS;
            const hexStr = hashValue.toString(16).toLowerCase();
            const paddedHex = hexStr.padStart(64, '0');
            return '0x' + paddedHex;
        }

        const paddedHashes = this.padHashes(leafHashes);
        const api = await this.getBarretenbergApi();
        let layer: Fr[] = paddedHashes.map(hash => this.hashToField(hash));
        let size = leafHashes.length;

        for (let level = 0; level < MerkleTreeBuilderService.MAX_LEVELS; level++) {
            const next: Fr[] = [];
            let idx = 0;
            const pairs = Math.floor(size / 2);

            for (let i = 0; i < pairs; i++) {
                const left = layer[i * 2];
                const right = (i * 2 + 1 < size) ? layer[i * 2 + 1] : left;
                const hashResult = api.pedersenHash([left, right], 0);
                if (hashResult instanceof Fr) {
                    next[idx] = hashResult;
                } else {
                    const resultStr = String(hashResult).replace(/^0x/, '');
                    next[idx] = new Fr(BigInt('0x' + resultStr));
                }
                idx++;
            }

            if (size % 2 === 1) {
                const lastValue = layer[size - 1];
                const hashResult = api.pedersenHash([lastValue, lastValue], 0);
                if (hashResult instanceof Fr) {
                    next[idx] = hashResult;
                } else {
                    const resultStr = String(hashResult).replace(/^0x/, '');
                    next[idx] = new Fr(BigInt('0x' + resultStr));
                }
                idx++;
            }

            while (next.length < MerkleTreeBuilderService.MAX_LEAVES) {
                next.push(new Fr(0n));
            }

            layer = next;
            size = idx;

            if (size === 1) {
                break;
            }
        }

        const rootField = layer[0];
        const rawResult = rootField.toString();
        const cleanHex = rawResult.replace(/^0x/, '').toLowerCase();
        const hashValue = BigInt('0x' + cleanHex);
        const hexStr = hashValue.toString(16).toLowerCase();
        const paddedHex = hexStr.padStart(64, '0');
        return '0x' + paddedHex;
    }

    public async validateRoot(claimedRoot: string, leafHashes: string[]): Promise<boolean> {
        const calculatedRoot = await this.buildMerkleRoot(leafHashes);
        return claimedRoot.toLowerCase() === calculatedRoot.toLowerCase();
    }
}