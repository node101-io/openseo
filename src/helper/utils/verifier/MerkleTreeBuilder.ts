import { Fr } from '@aztec/bb.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { formatHashResult } from '../common/hashUtils.js';
import { MAX_CHUNKS } from '../common/constants.js';

export namespace MerkleTreeBuilder {
    const MAX_LEVELS = 6; 
    function hashToField(hexHash: string): Fr {
        const hashValue = barretenbergApi.hexToFieldValue(hexHash);
        return new Fr(hashValue);
    }

    function padHashes(hashes: string[], targetSize: number): string[] {
        const padded = [...hashes];
        while (padded.length < targetSize) {
            padded.push('0x0');
        }
        return padded.slice(0, targetSize);
    }

    export async function buildMerkleRoot(leafHashes: string[]): Promise<string> {
        if (leafHashes.length === 0) {
            return '0x0';
        }

        if (leafHashes.length > MAX_CHUNKS) {
            throw new Error(
                `Too many leaves: ${leafHashes.length}. Maximum is ${MAX_CHUNKS}`
            );
        }

        if (leafHashes.length === 1) {
            const singleHash = leafHashes[0];
            const hashValue = barretenbergApi.hexToFieldValue(singleHash);
            return formatHashResult(new Fr(hashValue));
        }

        const paddedHashes = padHashes(leafHashes, MAX_CHUNKS);
        const api = await barretenbergApi.getBarretenbergApi();
        let layer: Fr[] = paddedHashes.map(hash => hashToField(hash));
        let size = leafHashes.length;

        for (let level = 0; level < MAX_LEVELS; level++) {
            const next: Fr[] = [];
            let idx = 0;
            const pairs = Math.floor(size / 2);

            for (let i = 0; i < MAX_CHUNKS; i++) {
                const shouldProcess = i < pairs;
                if (shouldProcess) {
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

            while (next.length < MAX_CHUNKS) {
                next.push(new Fr(0n));
            }

            layer = next;
            size = idx;
        }

        const rootField = layer[0];
        return formatHashResult(rootField);
    }

    export async function validateRoot(claimedRoot: string, leafHashes: string[]): Promise<boolean> {
        const calculatedRoot = await buildMerkleRoot(leafHashes);
        return claimedRoot.toLowerCase() === calculatedRoot.toLowerCase();
    }
}
