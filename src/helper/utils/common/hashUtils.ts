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