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