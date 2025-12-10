import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { proveAllWords } from './proveAll.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HTMLTestResult {
    html_file: string;
    success: boolean;
    verified: boolean;
    merkle_root: string;
    word_count: number;
    total_proof_generation_time_ms: number;
    total_verification_time_ms: number;
    verification_details?: {
        totalTime: number;
        circuitLoadTime?: number;
        backendInitTime?: number;
        verifyTime?: number;
    };
    proof_size_bytes: number;
    processing_time_ms: number;
    error?: string;
    output_directory: string;
    keywords: string;
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
    average_processing_time_ms: number;
    total_proof_size_bytes: number;
    results: HTMLTestResult[];
}

interface KeywordsMapping {
    [htmlFileName: string]: string;
}

function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function question(rl: readline.Interface, query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

function naturalSort(files: string[]): string[] {
    return files.sort((a, b) => {
        const nameA = a.replace(/\.html?$/i, '');
        const nameB = b.replace(/\.html?$/i, '');
        const numA = parseInt(nameA);
        const numB = parseInt(nameB);
        const isNumericA = !isNaN(numA) && nameA === numA.toString();
        const isNumericB = !isNaN(numB) && nameB === numB.toString();
        
        if (isNumericA && isNumericB) {
            return numA - numB;
        }
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
}

async function collectKeywordsInteractively(htmlFiles: string[]): Promise<KeywordsMapping> {
    const rl = createReadlineInterface();
    const mapping: KeywordsMapping = {};

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Keywords Collection ===`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Found ${htmlFiles.length} HTML file(s). Please enter keywords for each file.`);
    console.log(`(Separate multiple keywords with commas, e.g., "seo,keyword,test")\n`);

    for (let i = 0; i < htmlFiles.length; i++) {
        const htmlFile = htmlFiles[i];
        let keywords = '';
        
        while (!keywords.trim()) {
            keywords = await question(rl, `[${i + 1}/${htmlFiles.length}] Keywords for "${htmlFile}": `);
            keywords = keywords.trim();
            
            if (!keywords) {
                console.log('Keywords cannot be empty. Please enter at least one keyword.');
            }
        }
        
        mapping[htmlFile] = keywords;
        console.log(`✓ Saved: ${htmlFile} -> ${keywords}\n`);
    }

    rl.close();
    return mapping;
}

function saveMappingToTxt(mapping: KeywordsMapping, outputPath: string): void {
    let content = 'Keywords Mapping\n';
    content += '='.repeat(60) + '\n\n';
    content += `Generated: ${new Date().toISOString()}\n\n`;
    
    for (const [fileName, keywords] of Object.entries(mapping)) {
        content += `${fileName}\n`;
        content += `  Keywords: ${keywords}\n\n`;
    }
    
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`\n✓ Keywords mapping saved to: ${outputPath}`);
}

function saveResultsToTxt(batchResults: BatchTestResults, outputPath: string): void {
    let content = 'Batch Processing Results\n';
    content += '='.repeat(60) + '\n\n';
    content += `Timestamp: ${batchResults.timestamp}\n`;
    content += `HTML Folder: ${batchResults.html_folder}\n`;
    content += `Total Files: ${batchResults.total_files}\n`;
    content += `Processed Files: ${batchResults.processed_files}\n`;
    content += `Successful Files: ${batchResults.successful_files}\n`;
    content += `Failed Files: ${batchResults.failed_files}\n`;
    content += `Verified Files: ${batchResults.verified_files}\n`;
    content += `Total Processing Time: ${batchResults.total_processing_time_ms.toFixed(2)}ms\n`;
    content += `Average Proof Generation Time: ${batchResults.average_proof_generation_time_ms.toFixed(2)}ms\n`;
    content += `Average Verification Time: ${batchResults.average_verification_time_ms.toFixed(2)}ms\n`;
    content += `Average Processing Time: ${batchResults.average_processing_time_ms.toFixed(2)}ms\n`;
    content += `Total Proof Size: ${batchResults.total_proof_size_bytes} bytes\n\n`;
    
    content += 'Detailed Results\n';
    content += '-'.repeat(60) + '\n\n';
    
    batchResults.results.forEach((result, index) => {
        content += `[${index + 1}] ${result.html_file}\n`;
        content += `  Status: ${result.success ? 'SUCCESS' : 'FAILED'}\n`;
        content += `  Verified: ${result.verified ? 'YES' : 'NO'}\n`;
        content += `  Word Count: ${result.word_count}\n`;
        content += `  Merkle Root: ${result.merkle_root.substring(0, 32)}...\n`;
        content += `  Proof Generation Time: ${result.total_proof_generation_time_ms.toFixed(2)}ms\n`;
        content += `  Verification Time: ${result.total_verification_time_ms.toFixed(2)}ms\n`;
        content += `  Proof Size: ${result.proof_size_bytes} bytes\n`;
        content += `  Processing Time: ${result.processing_time_ms.toFixed(2)}ms\n`;
        content += `  Keywords: ${result.keywords}\n`;
        if (result.error) {
            content += `  Error: ${result.error}\n`;
        }
        if (result.output_directory) {
            content += `  Output Directory: ${result.output_directory}\n`;
        }
        content += '\n';
    });
    
    fs.writeFileSync(outputPath, content, 'utf-8');
}

function saveAnalizTxt(batchResults: BatchTestResults, outputPath: string): void {
    let content = 'Analiz Raporu\n';
    content += '='.repeat(60) + '\n\n';
    content += `Oluşturulma Tarihi: ${new Date(batchResults.timestamp).toLocaleString('tr-TR')}\n`;
    content += `HTML Klasörü: ${batchResults.html_folder}\n`;
    content += `Toplam Dosya: ${batchResults.total_files}\n\n`;
    content += 'Özet İstatistikler\n';
    content += '-'.repeat(60) + '\n';
    content += `Başarılı Dosyalar: ${batchResults.successful_files}\n`;
    content += `Başarısız Dosyalar: ${batchResults.failed_files}\n`;
    content += `Doğrulanan Dosyalar: ${batchResults.verified_files}\n`;
    content += `Ortalama Proof Generation Time: ${batchResults.average_proof_generation_time_ms.toFixed(2)}ms\n`;
    content += `Ortalama Verification Time: ${batchResults.average_verification_time_ms.toFixed(2)}ms\n`;
    content += `Toplam İşlem Süresi: ${batchResults.total_processing_time_ms.toFixed(2)}ms\n\n`;
    content += 'Dosya Bazında Analiz\n';
    content += '='.repeat(60) + '\n\n';
    batchResults.results.forEach((result, index) => {
        content += `[${index + 1}] ${result.html_file}\n`;
        content += `  Proof Generation Time: ${result.total_proof_generation_time_ms.toFixed(2)}ms\n`;
        content += `  Verification Time: ${result.total_verification_time_ms.toFixed(2)}ms\n`;
        content += `  Keywords: ${result.keywords}\n`;
        content += `  Toplam Süre: ${(result.total_proof_generation_time_ms + result.total_verification_time_ms).toFixed(2)}ms\n`;
        content += `  Durum: ${result.success ? 'BAŞARILI' : 'BAŞARISIZ'}\n`;
        content += `  Doğrulandı: ${result.verified ? 'EVET' : 'HAYIR'}\n`;
        if (result.error) {
            content += `  Hata: ${result.error}\n`;
        }
        content += '\n';
    });
    
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`✓ Analiz raporu kaydedildi: ${outputPath}`);
}

async function processHTMLFiles(
    htmlFolderPath: string,
    keywordsOrMappingPath: string,
    outputBaseDir: string = 'batch_results'
): Promise<BatchTestResults> {
    const batchStartTime = performance.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (!fs.existsSync(htmlFolderPath)) {
        throw new Error(`HTML folder not found: ${htmlFolderPath}`);
    }

    let keywordsMapping: KeywordsMapping | null = null;
    let defaultKeywords: string = '';
    
    if (keywordsOrMappingPath.endsWith('.json')) {
        if (!fs.existsSync(keywordsOrMappingPath)) {
            throw new Error(`Keywords mapping file not found: ${keywordsOrMappingPath}`);
        }
        try {
            const mappingContent = fs.readFileSync(keywordsOrMappingPath, 'utf-8');
            keywordsMapping = JSON.parse(mappingContent) as KeywordsMapping;
            console.log(`\n=== Loading Keywords Mapping ===`);
            console.log(`Mapping File: ${keywordsOrMappingPath}`);
            console.log(`Mapped files: ${Object.keys(keywordsMapping).length}`);
        } catch (error) {
            throw new Error(`Failed to parse keywords mapping file: ${(error as Error).message}`);
        }
    } else {
        defaultKeywords = keywordsOrMappingPath;
    }

    const files = fs.readdirSync(htmlFolderPath);
    const htmlFiles = naturalSort(files.filter(file => 
        file.toLowerCase().endsWith('.html') || file.toLowerCase().endsWith('.htm')
    ));

    if (htmlFiles.length === 0) {
        throw new Error(`No HTML files found in: ${htmlFolderPath}`);
    }

    console.log(`\n=== Batch Processing Started ===`);
    console.log(`HTML Folder: ${htmlFolderPath}`);
    console.log(`Found ${htmlFiles.length} HTML file(s)`);
    if (keywordsMapping) {
        console.log(`Keywords: Using mapping file (${Object.keys(keywordsMapping).length} mappings)`);
    } else {
        console.log(`Keywords: ${defaultKeywords}`);
    }
    console.log(`\n`);

    const results: HTMLTestResult[] = [];
    let processedCount = 0;
    let successfulCount = 0;
    let failedCount = 0;
    let verifiedCount = 0;
    let totalProofGenTime = 0;
    let totalVerificationTime = 0;
    let totalProcessingTime = 0;
    let totalProofSize = 0;

    const outputDir = path.join(process.cwd(), outputBaseDir, `batch_${timestamp}`);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (let i = 0; i < htmlFiles.length; i++) {
        const htmlFile = htmlFiles[i];
        const htmlFilePath = path.join(htmlFolderPath, htmlFile);
        
        let keywordsForThisFile: string;
        if (keywordsMapping) {
            // Try exact filename match first
            if (keywordsMapping[htmlFile]) {
                keywordsForThisFile = keywordsMapping[htmlFile];
            } else {
                // Try without extension
                const fileNameWithoutExt = path.basename(htmlFile, path.extname(htmlFile));
                if (keywordsMapping[fileNameWithoutExt]) {
                    keywordsForThisFile = keywordsMapping[fileNameWithoutExt];
                } else {
                    // Try with .html extension if it was .htm
                    const altFileName = htmlFile.endsWith('.htm') ? htmlFile + 'l' : htmlFile;
                    if (keywordsMapping[altFileName]) {
                        keywordsForThisFile = keywordsMapping[altFileName];
                    } else {
                        throw new Error(`No keywords mapping found for file: ${htmlFile}. Please add it to the mapping file.`);
                    }
                }
            }
        } else {
            keywordsForThisFile = defaultKeywords;
        }
        
        console.log(`\n[${i + 1}/${htmlFiles.length}] Processing: ${htmlFile}`);
        console.log(`Keywords: ${keywordsForThisFile}`);
        console.log('─'.repeat(60));

        try {
            const summary = await proveAllWords(
                htmlFilePath,
                keywordsForThisFile,
                false,
                path.join(outputDir, `html_${i + 1}_${path.basename(htmlFile, path.extname(htmlFile))}`)
            );

            const result: HTMLTestResult = {
                html_file: htmlFile,
                success: summary.successful_proofs > 0,
                keywords: keywordsForThisFile,
                verified: summary.verified_proofs > 0,
                merkle_root: summary.merkle_root,
                word_count: summary.word_count,
                total_proof_generation_time_ms: summary.total_proof_generation_time_ms,
                total_verification_time_ms: summary.total_verification_time_ms,
                proof_size_bytes: summary.total_proof_size_bytes,
                processing_time_ms: summary.processing_time_ms,
                output_directory: summary.output_directory
            };

            const proofDataPath = path.join(summary.output_directory, 'proof.json');
            if (fs.existsSync(proofDataPath)) {
                const proofData = JSON.parse(fs.readFileSync(proofDataPath, 'utf-8'));
                if (proofData.verificationDetails) {
                    result.verification_details = proofData.verificationDetails;
                }
            }

            if (!summary.successful_proofs) {
                result.error = 'Proof generation failed';
                failedCount++;
            } else {
                successfulCount++;
                if (summary.verified_proofs > 0) {
                    verifiedCount++;
                }
            }

            results.push(result);
            processedCount++;

            totalProofGenTime += summary.total_proof_generation_time_ms;
            totalVerificationTime += summary.total_verification_time_ms;
            totalProcessingTime += summary.processing_time_ms;
            totalProofSize += summary.total_proof_size_bytes;

            console.log(`✓ Completed: ${htmlFile}`);
            console.log(`  Proof Generation: ${summary.total_proof_generation_time_ms.toFixed(2)}ms`);
            console.log(`  Verification: ${summary.total_verification_time_ms.toFixed(2)}ms`);
            console.log(`  Verified: ${summary.verified_proofs > 0 ? 'YES' : 'NO'}`);

        } catch (error) {
            console.error(`✗ Failed: ${htmlFile}`);
            console.error(`  Error: ${(error as Error).message}`);
            
            const errorResult: HTMLTestResult = {
                html_file: htmlFile,
                keywords: keywordsForThisFile,
                success: false,
                verified: false,
                merkle_root: '',
                word_count: 0,
                total_proof_generation_time_ms: 0,
                total_verification_time_ms: 0,
                proof_size_bytes: 0,
                processing_time_ms: 0,
                error: (error as Error).message,
                output_directory: ''
            };
            results.push(errorResult);
            failedCount++;
            processedCount++;
        }
    }

    const batchEndTime = performance.now();
    const totalBatchTime = batchEndTime - batchStartTime;

    const averageProofGenTime = processedCount > 0 ? totalProofGenTime / processedCount : 0;
    const averageVerificationTime = processedCount > 0 ? totalVerificationTime / processedCount : 0;
    const averageProcessingTime = processedCount > 0 ? totalProcessingTime / processedCount : 0;
    const allKeywords = results.map(r => r.keywords).filter(k => k).join(', ');

    const batchResults: BatchTestResults = {
        timestamp: new Date().toISOString(),
        html_folder: htmlFolderPath,
        keywords: allKeywords || (keywordsMapping ? 'Multiple keywords' : defaultKeywords),
        total_files: htmlFiles.length,
        processed_files: processedCount,
        successful_files: successfulCount,
        failed_files: failedCount,
        verified_files: verifiedCount,
        total_processing_time_ms: totalBatchTime,
        average_proof_generation_time_ms: averageProofGenTime,
        average_verification_time_ms: averageVerificationTime,
        average_processing_time_ms: averageProcessingTime,
        total_proof_size_bytes: totalProofSize,
        results
    };

    const resultsPath = path.join(outputDir, 'batch_test_results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(batchResults, null, 2));

    // Also save results as .txt file
    const resultsTxtPath = path.join(outputDir, 'batch_test_results.txt');
    saveResultsToTxt(batchResults, resultsTxtPath);

    // Save analiz.txt file
    const analizPath = path.join(process.cwd(), 'analiz.txt');
    saveAnalizTxt(batchResults, analizPath);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Batch Processing Completed ===`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Files: ${htmlFiles.length}`);
    console.log(`Processed: ${processedCount}`);
    console.log(`Successful: ${successfulCount}`);
    console.log(`Failed: ${failedCount}`);
    console.log(`Verified: ${verifiedCount}`);
    console.log(`Total Processing Time: ${totalBatchTime.toFixed(2)}ms`);
    console.log(`Average Proof Generation Time: ${averageProofGenTime.toFixed(2)}ms`);
    console.log(`Average Verification Time: ${averageVerificationTime.toFixed(2)}ms`);
    console.log(`Average Processing Time: ${averageProcessingTime.toFixed(2)}ms`);
    console.log(`Total Proof Size: ${totalProofSize} bytes`);
    console.log(`\nResults saved to:`);
    console.log(`  JSON: ${resultsPath}`);
    console.log(`  TXT:  ${resultsTxtPath}`);
    console.log(`  ANALIZ: ${analizPath}`);
    console.log(`${'='.repeat(60)}\n`);

    return batchResults;
}

const __filename_batch = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && (
    path.resolve(process.argv[1]) === path.resolve(__filename_batch) ||
    process.argv[1].endsWith('batchProcess.ts'));

if (isMainModule) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: tsx src/batchProcess.ts <html_folder> [output_dir]');
        console.log('');
        console.log('The program will:');
        console.log('  1. Scan the HTML folder for .html/.htm files');
        console.log('  2. Ask you to enter keywords for each file interactively');
        console.log('  3. Process all files with their respective keywords');
        console.log('  4. Save results in both JSON and TXT formats');
        console.log('');
        console.log('Example:');
        console.log('  tsx src/batchProcess.ts html_files batch_results');
        process.exit(1);
    }

    const htmlFolder = args[0];
    const outputDir = args[1] || 'batch_results';

    (async () => {
        try {
            // First, find all HTML files
            if (!fs.existsSync(htmlFolder)) {
                throw new Error(`HTML folder not found: ${htmlFolder}`);
            }

            const files = fs.readdirSync(htmlFolder);
            const htmlFiles = naturalSort(files.filter(file => 
                file.toLowerCase().endsWith('.html') || file.toLowerCase().endsWith('.htm')
            ));

            if (htmlFiles.length === 0) {
                throw new Error(`No HTML files found in: ${htmlFolder}`);
            }

            // Collect keywords interactively
            const keywordsMapping = await collectKeywordsInteractively(htmlFiles);

            // Save mapping to .txt file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const mappingOutputDir = path.join(process.cwd(), outputDir, `batch_${timestamp}`);
            if (!fs.existsSync(mappingOutputDir)) {
                fs.mkdirSync(mappingOutputDir, { recursive: true });
            }
            const mappingTxtPath = path.join(mappingOutputDir, 'keywords_mapping.txt');
            saveMappingToTxt(keywordsMapping, mappingTxtPath);

            // Create a temporary JSON mapping file for processHTMLFiles
            const tempMappingJsonPath = path.join(mappingOutputDir, 'keywords_mapping_temp.json');
            fs.writeFileSync(tempMappingJsonPath, JSON.stringify(keywordsMapping, null, 2));

            // Process files with the collected keywords
            await processHTMLFiles(htmlFolder, tempMappingJsonPath, outputDir);

            // Clean up temporary JSON file (optional - you might want to keep it)
            // fs.unlinkSync(tempMappingJsonPath);

        } catch (error) {
            console.error('Batch processing error:', (error as Error).message);
            process.exit(1);
        }
    })();
}

export { processHTMLFiles, BatchTestResults, HTMLTestResult };

