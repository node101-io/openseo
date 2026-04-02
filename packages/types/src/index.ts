export interface WordScorePair {
    word: string;
    score: number;
}

export interface ProverOutput {
    htmlRoot: string;
    wordScorePairs: WordScorePair[];
    wordHashes: string[];
}

export interface ProofResult {
    proof: string;
    publicInputs: string;
    wordHashes: string[];
    success: boolean;
    proofSize: number;
    error?: string;
}

export interface VerificationResult {
    isValid: boolean;
    totalTime: number;
    verifyTime: number;
    error?: string;
}

export interface KeywordResult {
    word: string;
    score: number;
    success: boolean;
    verified: boolean;
    proofGenerationTime: number;
    verificationTime: number;
    proofSize: number;
    error?: string;
}

export interface Summary {
    timestamp: string;
    html_file: string;
    merkle_root: string;
    word_score_pairs: WordScorePair[];
    word_count: number;
    total_proof_generation_time_ms: number;
    total_verification_time_ms: number;
    total_proof_size_bytes: number;
    successful_proofs: number;
    failed_proofs: number;
    verified_proofs: number;
    processing_time_ms: number;
    output_directory: string;
    results: KeywordResult[];
    summary_path?: string;
}

export interface LinearizedWord {
    word: string;
    weight: number;
    tag: string;
    position: number;
}

export interface ParsedHTML {
    words: LinearizedWord[];
    totalWords: number;
}

export interface SearchResult {
    rank: number;
    id: string;
    cid: string;
    root: string;
    siteUrl: string;
    keywords: string[];
    keywordScores: { keyword: string; score: number }[];
    totalScore: number;
    proof: string;
    verified: boolean;
    createdAt: string;
}

export interface SearchResponse {
    success: boolean;
    query: string;
    count: number;
    results: SearchResult[];
    error?: string;
}

export interface VerifyResponse {
    success: boolean;
    verified: boolean;
    verifyTime?: number;
    totalTime?: number;
    message: string;
    error?: string;
}

export interface DABroadcastData {
    root: string;
    keywords: string[];
    siteUrl: string;
    proof: string;
    keywordScores: { keyword: string; score: number }[];
    rawKeywordScores?: number[];
    totalScore?: number;
}

export interface IndexerResult {
    success: boolean;
    message: string;
    record?: any;
    error?: string;
}

export interface CircuitInputs {
    keywordCount: number;
    isKeyword: number;
    keywordPositions: number[];
    wordHashes: string[];
    tagIds: number[];
    wordCount: number;
    htmlRoot: string;
    totalScore: number;
}

export type CircuitInput = CircuitInputs;