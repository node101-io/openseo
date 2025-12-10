import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeText } from './teleportationHash.js';
import { ProverService } from './services/ProverService.js';
import { ZKProofService } from './services/ZKProofService.js';
import { WordScorePair } from './types/ProverTypes.js';
import { performance } from 'perf_hooks';

interface KeywordResult {
    word: string;
    score: number;
    success: boolean;
    verified: boolean;
    proofGenerationTime?: number;
    verificationTime?: number;
    proofSize?: number;
    error?: string;
}

interface Summary {
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

export async function proveAllWords(
    htmlFilePathOrContent: string,
    targetKeywordInput: string = '',
    isDirectContent: boolean = false,
    outputDirPrefix: string | null = null
): Promise<Summary> {
    const startedAt = performance.now();
    const htmlContent = isDirectContent
        ? htmlFilePathOrContent
        : fs.readFileSync(htmlFilePathOrContent, 'utf-8');

    const keywordInputs = targetKeywordInput.trim().split(/[\s,]+/).filter(k => k.length > 0);

    if (keywordInputs.length === 0) {
        throw new Error('At least one keyword is required for proof generation.');
    }

    if (keywordInputs.length > 16) {
        throw new Error(`Maximum 16 keywords allowed, got ${keywordInputs.length}`);
    }

    const normalizedKeywords = keywordInputs.map(k => sanitizeText(k)).filter(k => k.length > 0);
    const proverService = new ProverService();
    const zkProofService = new ZKProofService();
    console.log(`\n=== Generating Prover Output ===`);
    const proverOutput = await proverService.generateProof(htmlContent, normalizedKeywords);
    console.log(`Merkle Root: ${proverOutput.merkleRoot}`);
    console.log(`Word-Score Pairs: ${proverOutput.wordScorePairs.length}`);
    proverOutput.wordScorePairs.forEach(({ word, score }) => {
        console.log(`  - ${word}: ${score} points`);
    });
    const occurrenceDataMap = proverService.getOccurrenceData(htmlContent, normalizedKeywords);
    let outputDir: string;
    if (outputDirPrefix) {
        outputDir = outputDirPrefix;
    } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        outputDir = `proofs_batch_${timestamp}`;
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const proverOutputPath = path.join(outputDir, 'prover_output.json');
    fs.writeFileSync(proverOutputPath, JSON.stringify({
        merkleRoot: proverOutput.merkleRoot,
        wordScorePairs: proverOutput.wordScorePairs,
        timestamp: new Date().toISOString()
    }, null, 2));

    console.log(`\n=== Generating ZK Proof ===`);
    const proofStartTime = performance.now();
    
    const proofResult = await zkProofService.generateProof(
        proverOutput.merkleRoot,
        proverOutput.wordScorePairs,
        occurrenceDataMap
    );
    
    const proofEndTime = performance.now();
    const proofGenerationTime = proofEndTime - proofStartTime;

    if (proofResult.success && proofResult.wordHashes) {
        console.log(`\n=== Hash List (Word + Word-Score Hashes) ===`);
        console.log(`Total hashes: ${proofResult.wordHashes.length}`);
        proofResult.wordHashes.forEach((hash, index) => {
            const wordScorePair = proverOutput.wordScorePairs[index];
            if (wordScorePair) {
                console.log(`  [${index + 1}] Word: "${wordScorePair.word}", Score: ${wordScorePair.score}`);
                console.log(`      Hash: ${hash.substring(0, 32)}...${hash.substring(hash.length - 8)}`);
            } else {
                console.log(`  [${index + 1}] Hash: ${hash.substring(0, 32)}...${hash.substring(hash.length - 8)}`);
            }
        });
    } else {
        console.log(`\n Warning: Hash list not found in proof result`);
    }

    let verificationTime = 0;
    let isVerified = false;
    let verificationDetails: any = null;

    if (proofResult.success && proofResult.proof && proofResult.publicInputs) {
        try {
            if (!proofResult.wordHashes || proofResult.wordHashes.length === 0) {
                throw new Error('Word hashes not found in proof result');
            }
            
            console.log(`\n=== Verifying Proof ===`);
            console.log(`Using hash list from proof (${proofResult.wordHashes.length} hashes)`);
            
            const verifyResult = await zkProofService.verifyProof(
                proofResult.proof, 
                proofResult.publicInputs,
                proofResult.wordHashes 
            );
            
            isVerified = verifyResult.isValid;
            verificationTime = verifyResult.totalTime;
            verificationDetails = {
                totalTime: verifyResult.totalTime,
                circuitLoadTime: verifyResult.circuitLoadTime,
                backendInitTime: verifyResult.backendInitTime,
                verifyTime: verifyResult.verifyTime,
                error: verifyResult.error
            };
            console.log(`\n=== Verification Result ===`);
            console.log(`Status: ${isVerified ? 'VERIFIED' : 'FAILED'}`);
            if (verifyResult.error) {
                console.log(`Error: ${verifyResult.error}`);
            }
            console.log(`Total Time: ${verificationTime.toFixed(2)}ms`);
            if (verificationDetails.circuitLoadTime) {
                console.log(`  - Circuit Load Time: ${verificationDetails.circuitLoadTime.toFixed(2)}ms`);
            }
            if (verificationDetails.backendInitTime) {
                console.log(`  - Backend Init Time: ${verificationDetails.backendInitTime.toFixed(2)}ms`);
            }
            if (verificationDetails.verifyTime) {
                console.log(`  - Verify Operation Time: ${verificationDetails.verifyTime.toFixed(2)}ms`);
            }
        } catch (verifyError) {
            console.error('\nVerification error:', (verifyError as Error).message);
            isVerified = false;
        }
    }
    const proofDataPath = path.join(outputDir, 'proof.json');
    fs.writeFileSync(proofDataPath, JSON.stringify({
        merkleRoot: proverOutput.merkleRoot,
        wordScorePairs: proverOutput.wordScorePairs,
        wordHashes: proofResult.wordHashes || proverOutput.wordHashes, 
        proof: proofResult.proof,
        publicInputs: proofResult.publicInputs,
        proofGenerated: proofResult.success,
        proofVerified: isVerified,
        proofGenerationTimeMs: proofGenerationTime,
        verificationTimeMs: verificationTime,
        verificationDetails: verificationDetails,
        proofSizeBytes: proofResult.proofSize || 0,
        timestamp: new Date().toISOString()
    }, null, 2));

    const results: KeywordResult[] = proverOutput.wordScorePairs.map(({ word, score }) => ({
        word,
        score,
        success: proofResult.success,
        verified: isVerified,
        proofGenerationTime,
        verificationTime,
        proofSize: proofResult.proofSize || 0
    }));

    if (!proofResult.success) {
        results.forEach(r => {
            r.success = false;
            r.error = proofResult.error;
        });
    }

    const summary: Summary = {
        timestamp: new Date().toISOString(),
        html_file: isDirectContent ? 'Uploaded HTML Content' : htmlFilePathOrContent,
        merkle_root: proverOutput.merkleRoot,
        word_score_pairs: proverOutput.wordScorePairs,
        word_count: proverOutput.wordScorePairs.length,
        total_proof_generation_time_ms: proofGenerationTime,
        total_verification_time_ms: verificationTime,
        total_proof_size_bytes: proofResult.proofSize || 0,
        successful_proofs: proofResult.success ? results.length : 0,
        failed_proofs: proofResult.success ? 0 : results.length,
        verified_proofs: isVerified ? results.length : 0,
        processing_time_ms: performance.now() - startedAt,
        output_directory: outputDir,
        results
    };

    const summaryPath = path.join(outputDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    summary.summary_path = summaryPath;
    console.log(`\n=== Summary ===`);
    console.log(`Merkle Root: ${proverOutput.merkleRoot.substring(0, 32)}...`);
    console.log(`Word Count: ${proverOutput.wordScorePairs.length}`);
    console.log(`Proof Generation Time: ${proofGenerationTime.toFixed(2)}ms`);
    console.log(`Verification Time: ${verificationTime.toFixed(2)}ms`);
    if (verificationDetails) {
        console.log(`  - Circuit Load Time: ${verificationDetails.circuitLoadTime?.toFixed(2) || '0.00'}ms`);
        console.log(`  - Backend Init Time: ${verificationDetails.backendInitTime?.toFixed(2) || '0.00'}ms`);
        console.log(`  - Verify Operation Time: ${verificationDetails.verifyTime?.toFixed(2) || '0.00'}ms`);
    }
    console.log(`Proof Size: ${proofResult.proofSize || 0} bytes`);
    console.log(`Proof Verified: ${isVerified ? 'YES' : 'NO'}`);
    console.log(`Total Processing Time: ${(performance.now() - startedAt).toFixed(2)}ms`);
    console.log(`Output Directory: ${outputDir}`);

    return summary;
}

const __filename_proveAll = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && (
    path.resolve(process.argv[1]) === path.resolve(__filename_proveAll) ||
    process.argv[1].endsWith('proveAll.ts'));

if (isMainModule) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: tsx src/proveAll.ts <html> <keywords>');
        process.exit(1);
    }

    const htmlFile = args[0];
    const keywordInput = args.slice(1).join(' ');

    (async () => {
        try {
            await proveAllWords(htmlFile, keywordInput, false);
        } catch (error) {
            console.error('Error:', (error as Error).message);
            process.exit(1);
        }
    })();
}