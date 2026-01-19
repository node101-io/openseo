import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { CircuitProof, FullProofResult } from '../utils/prover/CircuitProof.js';
import { sanitizeText } from '../utils/common/textUtils.js';
import { performance } from 'perf_hooks';

interface HTMLTestResult {
    html_file: string;
    success: boolean;
    verified: boolean;
    merkle_root: string;
    word_count: number;
    total_proof_generation_time_ms: number;
    total_verification_time_ms: number;
    proof_size_bytes: number;
    processing_time_ms: number;
    error?: string;
    output_directory: string;
    keywords: string;
    total_score?: number; //if v4 circuit
}

interface BatchTestResults {
    timestamp: string;
    keywords: string;
    html_folder: string;
    total_files: number;
    processed_files: number;
    successful_files: number;
    failed_files: number;
    verified_files: number;
    total_processing_time_ms: number;
    average_proof_generation_time_ms: number;
    average_verification_time_ms: number;
    total_proof_size_bytes: number;
    results: HTMLTestResult[];
}

function naturalSort(files: string[]): string[] {
    return files.sort((a, b) => {
        const nameA = a.replace(/\.html?$/i, '');
        const nameB = b.replace(/\.html?$/i, '');
        const numA = parseInt(nameA);
        const numB = parseInt(nameB);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b, undefined, { numeric: true });
    });
}

function saveResultsToTxt(results: BatchTestResults, outputPath: string): void {
    let content = `BATCH PROCESSING RESULTS\n`;
    content += `Timestamp: ${results.timestamp}\n`;
    content += `HTML Folder: ${results.html_folder}\n`;
    content += `Keywords: ${results.keywords}\n\n`;
    content += `SUMMARY\n`;
    content += `${'─'.repeat(60)}\n`;
    content += `Total Files: ${results.total_files}\n`;
    content += `Processed: ${results.processed_files}\n`;
    content += `Successful: ${results.successful_files}\n`;
    content += `Failed: ${results.failed_files}\n`;
    content += `Verified: ${results.verified_files}\n\n`;
    content += `Total Processing Time: ${results.total_processing_time_ms.toFixed(2)}ms\n`;
    content += `Average Proof Generation: ${results.average_proof_generation_time_ms.toFixed(2)}ms\n`;
    content += `Average Verification: ${results.average_verification_time_ms.toFixed(2)}ms\n`;
    content += `Total Proof Size: ${results.total_proof_size_bytes} bytes\n\n`;
    content += `DETAILED RESULTS\n`;
    content += `${'─'.repeat(60)}\n\n`;
    
    results.results.forEach((r, i) => {
        content += `[${i + 1}] ${r.html_file}\n`;
        content += `Status: ${r.success ? 'SUCCESS' : 'FAILED'} | Verified: ${r.verified ? 'YES' : 'NO'}\n`;
        content += `Keywords: ${r.keywords}\n`;
        content += `Word Count: ${r.word_count}\n`;
        if (r.total_score !== undefined) {
            content += `Total Score: ${r.total_score}\n`;
        }
        content += `Proof Generation: ${r.total_proof_generation_time_ms.toFixed(2)}ms\n`;
        content += `Merkle Root: ${r.merkle_root ? r.merkle_root.substring(0, 40) + '...' : 'N/A'}\n`;
        content += `Verification: ${r.total_verification_time_ms.toFixed(2)}ms\n`;
        content += `Proof Size: ${r.proof_size_bytes} bytes\n`;
        content += `Total Time: ${r.processing_time_ms.toFixed(2)}ms\n`;
        if (r.error) content += `Error: ${r.error}\n`;
        if (r.output_directory) content += `Output: ${r.output_directory}\n`;
    });    
    fs.writeFileSync(outputPath, content);
}

async function processFile(
    htmlPath: string,
    keywords: string[],
    outputDir: string,
    type: 'v3' | 'v4' = 'v3'
): Promise<{ result: FullProofResult; proofTime: number; verifyTime: number; verified: boolean; verifyDetails?: {verifyTime: number } }> {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // Generate proof
    const proofStart = performance.now();
    const result = await CircuitProof.generateProof(htmlContent, keywords, type);
    const proofTime = performance.now() - proofStart;
    // Verify proof
    let verifyTime = 0;
    let verified = false;
    let verifyDetails: { verifyTime: number } | undefined;
    
    if (result.success && result.proof) {
        const verifyStart = performance.now();
        const verifyResult = await CircuitProof.verifyProof(result.proof, result.htmlRoot);
        verifyTime = performance.now() - verifyStart;
        verified = verifyResult.isValid;
        verifyDetails = {
            verifyTime: verifyResult.verifyTime
        };
    }

    // Save outputs
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    fs.writeFileSync(path.join(outputDir, 'proof.json'), JSON.stringify({
        htmlRoot: result.htmlRoot,
        wordScorePairs: result.wordScorePairs,
        proof: result.proof,
        publicInputs: result.publicInputs,
        success: result.success,
        verified,
        proofGenerationTimeMs: proofTime,
        verificationTimeMs: verifyTime,
        verificationDetails: verifyDetails,
        proofSizeBytes: result.proofSize,
        timestamp: new Date().toISOString()
    }, null, 2));

    return { result, proofTime, verifyTime, verified, verifyDetails };
}

async function processHTMLFiles(
    htmlFolderPath: string,
    keywordsInput: string = '',
    outputBaseDir: string = 'batch_results',
    type: 'v3' | 'v4' = 'v3'
): Promise<BatchTestResults> {
    const batchStart = performance.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (!fs.existsSync(htmlFolderPath)) {
        throw new Error(`Folder not found: ${htmlFolderPath}`);
    }

    const htmlFiles = naturalSort(
        fs.readdirSync(htmlFolderPath).filter(f => f.toLowerCase().endsWith('.html'))
    );

    if (htmlFiles.length === 0) {
        throw new Error(`No HTML files found in: ${htmlFolderPath}`);
    }

    // Parse keywords
    let keywordsMapping: Record<string, string> | null = null;
    let defaultKeywords = keywordsInput;

    if (keywordsInput.endsWith('.json') && fs.existsSync(keywordsInput)) {
        keywordsMapping = JSON.parse(fs.readFileSync(keywordsInput, 'utf-8'));
    }

    const outputDir = path.join(process.cwd(), outputBaseDir, `batch_${timestamp}`);
    fs.mkdirSync(outputDir, { recursive: true });

    const results: HTMLTestResult[] = [];
    let successCount = 0, failCount = 0, verifiedCount = 0;
    let totalProofTime = 0, totalVerifyTime = 0, totalSize = 0;

    for (let i = 0; i < htmlFiles.length; i++) {
        const file = htmlFiles[i];
        const filePath = path.join(htmlFolderPath, file);
        
        // Get keywords 
        let kwString: string;
        if (keywordsMapping) {
            kwString = keywordsMapping[file] || keywordsMapping[file.replace('.html', '')] || '';
        } else if (defaultKeywords) {
            kwString = defaultKeywords;
        } else {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            kwString = await new Promise(resolve => {
                rl.question(`Keywords for ${file}: `, answer => { rl.close(); resolve(answer.trim()); });
            });
        }

        const keywords = kwString.split(/[\s,]+/).map(k => sanitizeText(k)).filter(k => k);
        const fileOutputDir = path.join(outputDir, `html_${i + 1}_${file.replace('.html', '')}`);

        try {
            const { result, proofTime, verifyTime, verified, verifyDetails } = await processFile(filePath, keywords, fileOutputDir, type);

            results.push({
                html_file: file,
                keywords: kwString,
                success: result.success,
                verified,
                merkle_root: result.htmlRoot || '',
                word_count: result.wordScorePairs?.length || 0,
                total_score: result.totalScore,
                total_proof_generation_time_ms: proofTime,
                total_verification_time_ms: verifyTime,
                proof_size_bytes: result.proofSize || 0,
                processing_time_ms: proofTime + verifyTime,
                output_directory: fileOutputDir
            });

            if (result.success) successCount++;
            else failCount++;
            if (verified) verifiedCount++;
            
            totalProofTime += proofTime;
            totalVerifyTime += verifyTime;
            totalSize += result.proofSize || 0;
        } catch (error) {
            console.error(`\nFAILED: ${(error as Error).message}`);
            results.push({
                html_file: file,
                keywords: kwString,
                success: false,
                verified: false,
                merkle_root: '',
                word_count: 0,
                total_proof_generation_time_ms: 0,
                total_verification_time_ms: 0,
                proof_size_bytes: 0,
                processing_time_ms: 0,
                output_directory: '',
                error: (error as Error).message
            });
            failCount++;
        }
    }

    const totalTime = performance.now() - batchStart;
    const processed = results.length;

    const batchResults: BatchTestResults = {
        timestamp: new Date().toISOString(),
        html_folder: htmlFolderPath,
        keywords: keywordsMapping ? 'Multiple' : defaultKeywords,
        total_files: htmlFiles.length,
        processed_files: processed,
        successful_files: successCount,
        failed_files: failCount,
        verified_files: verifiedCount,
        total_processing_time_ms: totalTime,
        average_proof_generation_time_ms: processed > 0 ? totalProofTime / processed : 0,
        average_verification_time_ms: processed > 0 ? totalVerifyTime / processed : 0,
        total_proof_size_bytes: totalSize,
        results
    };

    // Save results
    fs.writeFileSync(path.join(outputDir, 'batch_results.json'), JSON.stringify(batchResults, null, 2));
    saveResultsToTxt(batchResults, path.join(outputDir, 'batch_results.txt'));
    saveResultsToTxt(batchResults, path.join(process.cwd(), 'analiz.txt'));
    return batchResults;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    let args = process.argv.slice(2);
    
    const separatorIndex = args.indexOf('--');
    if (separatorIndex !== -1) {
        args = args.slice(separatorIndex + 1);
    }
    
    if (args.length < 1) {
        console.log('Usage: npm run batch <html_folder> [keywords] [--type v3|v4]');
        console.log('npx tsx src/helper/scripts/batchProcess.ts <html_folder> [keywords] [--type v3|v4]');
        process.exit(1);
    }
    
    let type: 'v3' | 'v4' = 'v3';
    const typeIndex = args.indexOf('--type');
    if (typeIndex !== -1 && args[typeIndex + 1]) {
        const typeValue = args[typeIndex + 1].toLowerCase();
        if (typeValue === 'v3' || typeValue === 'v4') {
            type = typeValue as 'v3' | 'v4';
            args.splice(typeIndex, 2);
        }
    }
    
    const keywords = args.slice(1).join(' ').trim();
    processHTMLFiles(args[0], keywords, 'batch_results', type).catch(e => {
        console.error('Error:', e.message);
        process.exit(1);
    });
}

export { processHTMLFiles, BatchTestResults, HTMLTestResult };