import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeText } from '../common/textUtils.js';
import { KeywordAnalysis} from './KeywordAnalysis.js';
import { CircuitProof } from './CircuitProof.js';
import { HashService } from './Hashing.js';
import { KeywordResult, Summary } from '../common/ProverTypes.js';
import { MAX_WORDS } from '../common/constants.js';
import { performance } from 'perf_hooks';

export async function generateProofs(
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

    if (keywordInputs.length > MAX_WORDS) {
        throw new Error(`Maximum ${MAX_WORDS} keywords allowed, got ${keywordInputs.length}`);
    }

    const normalizedKeywords = keywordInputs.map(k => sanitizeText(k)).filter(k => k.length > 0);
    console.log(`\n=== Generating Prover Output ===`);
    const proverOutput = await KeywordAnalysis.analyzeKeywords(htmlContent, normalizedKeywords);
    console.log(`HTML Root: ${proverOutput.htmlRoot}`);
    console.log(`Word-Score Pairs: ${proverOutput.wordScorePairs.length}`);
    proverOutput.wordScorePairs.forEach(({ word, score }) => {
        console.log(`  - ${word}: ${score} points`);
    });
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
        htmlRoot: proverOutput.htmlRoot,
        wordScorePairs: proverOutput.wordScorePairs,
        timestamp: new Date().toISOString()
    }, null, 2));

    console.log(`\n=== Generating ZK Proof ===`);
    const proofStartTime = performance.now();
    const proofResult = await CircuitProof.generateProof(
        htmlContent,
        normalizedKeywords,
        proverOutput.htmlRoot
    );

    const proofEndTime = performance.now();
    const proofGenerationTime = proofEndTime - proofStartTime;

    if (proofResult.success && proofResult.wordHashes) {
        console.log(`\n=== Hash List (Word + Word-Score Hashes) ===`);
        console.log(`Total hashes: ${proofResult.wordHashes.length}`);
        
        const proverTomlPath = path.join(process.cwd(), 'circuits', 'v3', 'Prover.toml');
        let isKeywordArray: number[] = [];
        if (fs.existsSync(proverTomlPath)) {
            const tomlContent = fs.readFileSync(proverTomlPath, 'utf-8');
            const isKeywordMatch = tomlContent.match(/is_keyword = \[(.*?)\]/s);
            if (isKeywordMatch) {
                isKeywordArray = isKeywordMatch[1].split(',').map(s => parseInt(s.trim()));
            }
        }
        
        const keywordHashMap = new Map<string, string>();
        const keywordScoreMap = new Map<string, number>();
        for (const pair of proverOutput.wordScorePairs) {
            const keywordHash = HashService.hashWordForCircuit(pair.word);
            keywordHashMap.set(keywordHash, pair.word);
            keywordScoreMap.set(keywordHash, pair.score);
        }
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

            const verifyResult = await CircuitProof.verifyProof(
                proofResult.proof,
                proofResult.publicInputs,
                proverOutput.htmlRoot
            );

            isVerified = verifyResult.isValid;
            verificationTime = verifyResult.totalTime;
            verificationDetails = {
                totalTime: verifyResult.totalTime,
                circuitLoadTime: verifyResult.circuitLoadTime,
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
        htmlRoot: proverOutput.htmlRoot,
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
        merkle_root: proverOutput.htmlRoot,
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
    console.log(`\n*** Summary ***`);
    console.log(`HTML Root: ${proverOutput.htmlRoot.substring(0, 32)}...`);
    console.log(`Word Count: ${proverOutput.wordScorePairs.length}`);
    console.log(`Proof Generation Time: ${proofGenerationTime.toFixed(2)}ms`);
    console.log(`Verification Time: ${verificationTime.toFixed(2)}ms`);
    if (verificationDetails) {
        console.log(`Circuit Load Time: ${verificationDetails.circuitLoadTime?.toFixed(2) || '0.00'}ms`);
        console.log(`Verify Operation Time: ${verificationDetails.verifyTime?.toFixed(2) || '0.00'}ms`);
    }
    console.log(`Proof Size: ${proofResult.proofSize || 0} bytes`);
    console.log(`Proof Verified: ${isVerified ? 'YES' : 'NO'}`);
    console.log(`Total Processing Time: ${(performance.now() - startedAt).toFixed(2)}ms`);
    console.log(`Output Directory: ${outputDir}`);
    return summary;
}

export const proveAllWords = generateProofs;

const __filename_proofOrch = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && (
    path.resolve(process.argv[1]) === path.resolve(__filename_proofOrch) ||
    process.argv[1].endsWith('Prover.ts') ||
    process.argv[1].endsWith('Prover.js'));

if (isMainModule) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: npx tsx src/helper/utils/prover/Prover.ts <html_file> <keywords>');
        console.log('');
        console.log('For batch processing, use:');
        console.log('npx tsx src/helper/scripts/batchProcess.ts <html_folder> [keywords]');
        process.exit(1);
    }

    const htmlFile = args[0];
    const keywordInput = args.slice(1).join(' ');
    if (!fs.existsSync(htmlFile)) {
        throw new Error(`File not found: ${htmlFile}`);
    }

    const stats = fs.statSync(htmlFile);
    if (stats.isDirectory()) {
        console.error('Error: This command is for single file processing only.');
        console.error('For batch processing, use:');
        console.error('  npx tsx src/helper/scripts/batchProcess.ts <html_folder> [keywords]');
        process.exit(1);
    }

    (async () => {
        try {
            await generateProofs(htmlFile, keywordInput, false);
        } catch (error) {
            console.error('Error:', (error as Error).message);
            process.exit(1);
        }
    })();
}