export interface WordScorePair {
    word: string;
    score: number;
}

export interface WordOccurrenceData {
    word: string;
    occurrences: number;
    weights: number[];
}

export interface ProverOutput {
    merkleRoot: string;
    wordScorePairs: WordScorePair[];
    wordHashes: string[];
}

export interface VerifierInput {
    merkleRoot: string;
    wordScorePairs: WordScorePair[];
}

export interface ZKProofInput {
    merkleRoot: string;
    wordScores: WordScorePair[];
    occurrences: number[];
    weights: number[][];
}

export interface ProofResult {
    proof?: any;
    publicInputs?: any;
    success: boolean;
    proofSize?: number;
    error?: string;
}

export interface VerificationResult {
    isValid: boolean;
    totalTime: number;
    circuitLoadTime?: number;
    backendInitTime?: number;
    verifyTime?: number;
    error?: string;
}