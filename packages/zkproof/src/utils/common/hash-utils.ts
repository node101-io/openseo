import { FIELD_MODULUS } from './constants.js';

export function cleanHex(hex: string): string {
    return hex.replace(/^0x/, '').toLowerCase();
}

export function padHex(hex: string): string {
    const clean = cleanHex(hex);
    const hexStr = clean || '0';
    const paddedHex = hexStr.padStart(64, '0');
    return '0x' + paddedHex;
}

export function hashToNoirField(hexHash: string): string {
    if (hexHash === '0x0' || hexHash === '0x00' || !hexHash) {
        return '0x0';
    }
    const clean = cleanHex(hexHash);
    if (!clean || clean.length === 0) {
        return '0x0';
    }
    let hashValue = BigInt('0x' + clean);
    hashValue = hashValue % FIELD_MODULUS;
    const hexStr = hashValue.toString(16).toLowerCase();
    return padHex(hexStr);
}

export function formatHashResult(result: any): string {
    const rawResult = result.toString();
    const clean = cleanHex(rawResult);
    const hashValue = BigInt('0x' + clean);
    const hexStr = hashValue.toString(16).toLowerCase();
    return padHex(hexStr);
}

export function fieldToBytes32Hex(value: any): string {
    const raw = String(value?.toString?.() ?? value);
    const trimmed = raw.trim();
    let n: bigint;
    if (trimmed.startsWith('0x')) {
        const withoutPrefix = trimmed.slice(2).trim();
        n = withoutPrefix ? BigInt('0x' + withoutPrefix) : 0n;
    } else if (/^[0-9]+$/.test(trimmed)) {
        n = BigInt(trimmed);
    } else {
        const withoutPrefix = trimmed.replace(/^0x/i, '');
        n = withoutPrefix ? BigInt('0x' + withoutPrefix) : 0n;
    }
    n = n % FIELD_MODULUS;
    const hexStr = n.toString(16).toLowerCase();
    return padHex(hexStr);
}