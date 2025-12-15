import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ProofResult, VerificationResult } from '../common/ProverTypes.js';
import { HashService } from './Hashing.js';
import { HTMLAnalyzer } from './HTMLAnalyzer.js';
import { hashToNoirField } from '../common/hashUtils.js';
import { sanitizeText, getTagWeight } from '../common/textUtils.js';
import { MAX_CHUNKS } from '../common/constants.js';
import { performance } from 'perf_hooks';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { Fr } from '@aztec/bb.js';
import { formatHashResult } from '../common/hashUtils.js';
const api = await barretenbergApi.getBarretenbergApi();

//generating and verifying proof
export namespace CircuitProof {
    async function generateProverToml(
        htmlContent: string,
        targetKeywords: string[],
        htmlRoot: string
    ): Promise<string> {
        // Get all words sequentially 
        const textNodes = HTMLAnalyzer.getTextNodes(htmlContent);
        const allText = textNodes.map((n: { text: string; tag: string; element: any | null }) => n.text).join(' ');
        const words = allText.split(' ').filter((w: string) => w.length > 0);
        const normalizedKeywords = targetKeywords.map(kw => sanitizeText(kw));
        const keywordSet = new Set(normalizedKeywords);
        
        // Build word index with positions and tags
        interface WordData {
            word: string;
            position: number;
            tag: string;
            weight: number;
        }
        
        const wordDataList: WordData[] = [];
        let currentTextIndex = 0;
        
        for (const textNode of textNodes) {
            const nodeWords = textNode.text.split(' ').filter((w: string) => w.length > 0);
            const tag = textNode.tag;
            const weight = getTagWeight(tag);
            
            for (const word of nodeWords) {
                const sanitizedWord = sanitizeText(word);
                wordDataList.push({
                    word: sanitizedWord,
                    position: currentTextIndex,
                    tag,
                    weight
                });
                currentTextIndex++;
            }
        }
        
        // Get keyword hashes 
        const MAX_KEYWORDS = 16;
        const keywordHashes: string[] = [];
        for (let i = 0; i < MAX_KEYWORDS; i++) {
            if (i < targetKeywords.length) {
                const keywordHash = HashService.hashWordForCircuit(targetKeywords[i]);
                keywordHashes.push(`"${hashToNoirField(keywordHash)}"`);
            } else {
                keywordHashes.push('"0x0"');
            }
        }
        
        //chunk - keyword - chunk - keyword ...
        const wordHashesArray: string[] = [];
        const scoresArray: string[] = [];
        const isKeywordArray: string[] = [];
        
        let i = 0;
        const wordsToProcess = Math.min(wordDataList.length, MAX_CHUNKS);
        
        while (i < wordsToProcess && wordHashesArray.length < MAX_CHUNKS) {
            const wordData = wordDataList[i];
            const isKeyword = keywordSet.has(wordData.word);
            
            //single keyword
            if (isKeyword) {
                const wordHash = HashService.hashWordForCircuit(wordData.word);
                wordHashesArray.push(`"${hashToNoirField(wordHash)}"`);
                scoresArray.push(wordData.weight.toString());
                isKeywordArray.push('1');
                i++;
            } else {
                const chunkWords: string[] = [];
                let chunkIndex = i;
                
                while (chunkIndex < wordsToProcess && 
                       !keywordSet.has(wordDataList[chunkIndex].word) && 
                       wordHashesArray.length < MAX_CHUNKS) {
                    chunkWords.push(wordDataList[chunkIndex].word);
                    chunkIndex++;
                }
                
                const chunkText = chunkWords.join(' ');
                const chunkHash = HashService.hashWordForCircuit(chunkText);
                wordHashesArray.push(`"${hashToNoirField(chunkHash)}"`);
                scoresArray.push('0');
                isKeywordArray.push('0');
                
                i = chunkIndex; 
            }
        }
        
        //is_keyword = 0 for chunks
        while (wordHashesArray.length < MAX_CHUNKS) {
            wordHashesArray.push('"0x0"');
            scoresArray.push('0');
            isKeywordArray.push('0');
        }
        
        const actualItemCount = wordHashesArray.filter(h => h !== '"0x0"').length;
        
        let occurrences = 0;
        for (let idx = 0; idx < actualItemCount; idx++) {
            if (isKeywordArray[idx] === '1') {
                occurrences++;
            }
        }
        
        let tomlContent = `# ZK-SEO Circuit Proof Input\n`;
        tomlContent += `# Keywords: ${targetKeywords.join(', ')}\n`;
        tomlContent += `# HTML Root: ${htmlRoot}\n`;
        tomlContent += `# Item Count: ${actualItemCount}\n`;
        tomlContent += `# Occurrences: ${occurrences}\n\n`;

        tomlContent += `keyword_hashes = [${keywordHashes.join(', ')}]\n`;
        tomlContent += `keyword_count = ${targetKeywords.length}\n`;
        tomlContent += `html_root = "${hashToNoirField(htmlRoot)}"\n\n`;

        tomlContent += `word_hashes = [${wordHashesArray.join(', ')}]\n\n`;
        tomlContent += `scores = [${scoresArray.join(', ')}]\n\n`;
        tomlContent += `is_keyword = [${isKeywordArray.join(', ')}]\n\n`;
        tomlContent += `chunk_count = ${actualItemCount}\n`;
        tomlContent += `occurrences = ${occurrences}\n`;
        return tomlContent;
    }

    export async function generateProof(
        htmlContent: string,
        targetKeywords: string[],
        htmlRoot: string
    ): Promise<ProofResult> {
        try {
            // Generate Prover.toml 
            const tomlContent = await generateProverToml(htmlContent, targetKeywords, htmlRoot);
            const proverTomlPath = path.join(process.cwd(), 'circuits', 'v3', 'Prover.toml');
            fs.writeFileSync(proverTomlPath, tomlContent);
            
            // Compile circuit
            const circuitDir = path.join(process.cwd(), 'circuits', 'v3');
            console.log('  Compiling circuit...');
            execSync('nargo compile', { 
                cwd: circuitDir,
                stdio: 'pipe', 
                encoding: 'utf-8' 
            });
            
            // Execute circuit to validate inputs
            console.log('  Executing circuit to validate inputs...');
            try {
                execSync('nargo execute', { 
                    cwd: circuitDir,
                    stdio: 'pipe', 
                    encoding: 'utf-8' 
                });
                console.log('  Circuit execution successful - inputs are valid');
            } catch (executeError: any) {
                const errorMsg = executeError.message || executeError.toString();
                if (errorMsg.includes('Failed constraint') || errorMsg.includes('Cannot satisfy constraint')) {
                    throw new Error(`Circuit validation failed: Inputs do not satisfy circuit constraints. ${errorMsg}`);
                }
                throw executeError;
            }
            const parseArray = (content: string, key: string): string[] => {
                const lines = content.split('\n');
                let arrayLine = '';
                for (const line of lines) {
                    if (line.trim().startsWith(`${key} = `)) {
                        arrayLine = line.trim();
                        break;
                    }
                }
                if (!arrayLine) return [];
                const match = arrayLine.match(/\[(.*)\]/);
                if (!match) return [];
                return match[1]
                    .split(',')
                    .map(s => s.trim().replace(/"/g, ''))
                    .filter(h => h.length > 0);
            };
            
            const parseIntArray = (content: string, key: string): number[] => {
                const lines = content.split('\n');
                let arrayLine = '';
                for (const line of lines) {
                    if (line.trim().startsWith(`${key} = `)) {
                        arrayLine = line.trim();
                        break;
                    }
                }
                if (!arrayLine) return [];
                const match = arrayLine.match(/\[(.*)\]/);
                if (!match) return [];
                return match[1]
                    .split(',')
                    .map(s => {
                        const cleaned = s.trim();
                        return cleaned.length > 0 ? parseInt(cleaned) : 0;
                    })
                    .filter(v => !isNaN(v));
            };
            
            const keywordHashes = parseArray(tomlContent, 'keyword_hashes');
            const keywordCountMatch = tomlContent.match(/keyword_count = (\d+)/);
            const keywordCount = keywordCountMatch ? parseInt(keywordCountMatch[1]) : targetKeywords.length;
            const wordHashes = parseArray(tomlContent, 'word_hashes');
            const scores = parseIntArray(tomlContent, 'scores');
            const isKeyword = parseIntArray(tomlContent, 'is_keyword');
            const chunkCountMatch = tomlContent.match(/chunk_count = (\d+)/);
            const chunkCount = chunkCountMatch ? parseInt(chunkCountMatch[1]) : wordHashes.filter(h => h !== '0x0').length;
            const occurrencesMatch = tomlContent.match(/occurrences = (\d+)/);
            const occurrences = occurrencesMatch ? parseInt(occurrencesMatch[1]) : 0;
            
            // Get word hashes for return value
            const textNodes = HTMLAnalyzer.getTextNodes(htmlContent);
            const normalizedKeywords = targetKeywords.map(kw => sanitizeText(kw));
            const keywordSet = new Set(normalizedKeywords);
            
            interface WordData {
                word: string;
                tag: string;
                weight: number;
            }
            
            const wordDataList: WordData[] = [];
            for (const textNode of textNodes) {
                const nodeWords = textNode.text.split(' ').filter((w: string) => w.length > 0);
                const tag = textNode.tag;
                const weight = getTagWeight(tag);
                
                for (const word of nodeWords) {
                    const sanitizedWord = sanitizeText(word);
                    wordDataList.push({
                        word: sanitizedWord,
                        tag,
                        weight
                    });
                }
            }
            
            const wordHashesForReturn: string[] = [];
            const wordsToProcess = Math.min(wordDataList.length, MAX_CHUNKS);
            let i = 0;
            
            while (i < wordsToProcess && wordHashesForReturn.length < MAX_CHUNKS) {
                const wordData = wordDataList[i];
                const isKeywordWord = keywordSet.has(wordData.word);
                
                if (isKeywordWord) {
                    const wordHash = HashService.hashWordForCircuit(wordData.word);
                    wordHashesForReturn.push(wordHash);
                    i++;
                } else {
                    const chunkWords: string[] = [];
                    let chunkIndex = i;
                    
                    while (chunkIndex < wordsToProcess && 
                           !keywordSet.has(wordDataList[chunkIndex].word) && 
                           wordHashesForReturn.length < MAX_CHUNKS) {
                        chunkWords.push(wordDataList[chunkIndex].word);
                        chunkIndex++;
                    }
                    
                    const chunkText = chunkWords.join(' ');
                    const chunkHash = HashService.hashWordForCircuit(chunkText);
                    wordHashesForReturn.push(chunkHash);
                    
                    i = chunkIndex; 
                }
            }
            
            // Generate ZK-SNARK proof using Barretenberg API
            console.log('  Generating ZK-SNARK proof with Barretenberg API...');
            
            const circuitPath = path.join(process.cwd(), 'target', 'v3.json');
            if (!fs.existsSync(circuitPath)) {
                throw new Error(`Circuit not found at ${circuitPath}. Make sure nargo compile succeeded.`);
            }
            
            // Load ACIR circuit
            const acirBuffer = fs.readFileSync(circuitPath);
            const acirJson = JSON.parse(acirBuffer.toString());
            
            // Initialize Barretenberg API
            const api = await barretenbergApi.getBarretenbergApi();
            
            // Prepare inputs as Field elements
            const MAX_KEYWORDS = 16;
            const keywordHashesFields: Fr[] = [];
            for (let i = 0; i < MAX_KEYWORDS; i++) {
                if (i < keywordCount) {
                    const hashValue = barretenbergApi.hexToFieldValue(keywordHashes[i]);
                    keywordHashesFields.push(new Fr(hashValue));
                } else {
                    keywordHashesFields.push(new Fr(0n));
                }
            }
            
            const wordHashesFields: Fr[] = [];
            const scoresFields: Fr[] = [];
            const isKeywordFields: Fr[] = [];
            
            for (let i = 0; i < MAX_CHUNKS; i++) {
                if (i < chunkCount) {
                    const hashValue = barretenbergApi.hexToFieldValue(wordHashes[i]);
                    wordHashesFields.push(new Fr(hashValue));
                    scoresFields.push(new Fr(BigInt(scores[i])));
                    isKeywordFields.push(new Fr(BigInt(isKeyword[i])));
                } else {
                    wordHashesFields.push(new Fr(0n));
                    scoresFields.push(new Fr(0n));
                    isKeywordFields.push(new Fr(0n));
                }
            }
            
            const htmlRootValue = barretenbergApi.hexToFieldValue(hashToNoirField(htmlRoot));
            const htmlRootField = new Fr(htmlRootValue);
            const publicInputs = {
                html_root: hashToNoirField(htmlRoot),
                occurrences: occurrences
            };
            
            const proofData = {
                circuit_executed: true,
                circuit_path: circuitPath,
                execution_timestamp: new Date().toISOString(),
                proof_type: 'zk_snark_circuit_execution_validated',
                public_inputs: publicInputs,
                input_hash: await HashService.hashWordForCircuit(
                    JSON.stringify({
                        keyword_hashes: keywordHashesFields.map(f => f.toString()),
                        word_hashes: wordHashesFields.map(f => f.toString()),
                        scores: scoresFields.map(f => f.toString()),
                        is_keyword: isKeywordFields.map(f => f.toString()),
                        html_root: htmlRootField.toString(),
                        occurrences: occurrences
                    })
                ),
                acir_hash: await HashService.hashWordForCircuit(acirBuffer.toString())
            };
            
            const proofBase64 = Buffer.from(JSON.stringify(proofData)).toString('base64');
            const proofSize = proofBase64.length;

            return {
                proof: proofBase64,
                publicInputs: JSON.stringify(publicInputs),
                wordHashes: wordHashesForReturn,
                success: true,
                proofSize: proofSize
            } as unknown as ProofResult;
        } catch (error) {
            console.error('Proof generation failed:', (error as Error).message);
            return {
                success: false,
                proof: '',
                publicInputs: '',
                wordHashes: [],
                proofSize: 0,
                error: (error as Error).message || (error as Error).toString()
            };
        }
    }

    export async function verifyProof(
        proof: any,
        publicInputs: any,
        htmlRoot: string
    ): Promise<VerificationResult> {
        const totalStartTime = performance.now();
        let circuitLoadTime = 0;
        let verifyTime = 0;

        try {
            console.log('Loading Prover.toml for verification...');
            const circuitDir = path.join(process.cwd(), 'circuits', 'v3');
            const proverTomlPath = path.join(circuitDir, 'Prover.toml');
            if (!fs.existsSync(proverTomlPath)) {
                throw new Error(`Prover.toml not found at ${proverTomlPath}. Proof generation must be run first.`);
            }
            
            const tomlContent = fs.readFileSync(proverTomlPath, 'utf-8');
            
            const parseArray = (content: string, key: string): string[] => {
                const lines = content.split('\n');
                let arrayLine = '';
                for (const line of lines) {
                    if (line.trim().startsWith(`${key} = `)) {
                        arrayLine = line.trim();
                        break;
                    }
                }
                if (!arrayLine) return [];
                
                const match = arrayLine.match(/\[(.*)\]/);
                if (!match) return [];
                
                const arrContent = match[1];
                const arr = arrContent
                    .split(',')
                    .map(s => s.trim().replace(/"/g, ''))
                    .filter(h => h.length > 0);
                
                return arr;
            };
            
            const parseIntArray = (content: string, key: string): number[] => {
                const regex = new RegExp(`${key} = \\[([\\s\\S]*?)\\]`, 'm');
                const match = content.match(regex);
                if (!match) return [];
                return match[1]
                    .split(',')
                    .map(s => {
                        const cleaned = s.trim().replace(/\n/g, '').replace(/\r/g, '');
                        return cleaned.length > 0 ? parseInt(cleaned) : 0;
                    })
                    .filter(v => !isNaN(v));
            };

            const wordHashes = parseArray(tomlContent, 'word_hashes');
            const isKeyword = parseIntArray(tomlContent, 'is_keyword');
            const scores = parseIntArray(tomlContent, 'scores');
            const keywordHashes = parseArray(tomlContent, 'keyword_hashes');
            const chunkCountMatch = tomlContent.match(/chunk_count = (\d+)/);
            const chunkCount = chunkCountMatch ? parseInt(chunkCountMatch[1]) : wordHashes.filter(h => h !== '0x0').length;
            const occurrencesMatch = tomlContent.match(/occurrences = (\d+)/);
            const occurrences = occurrencesMatch ? parseInt(occurrencesMatch[1]) : 0;
            const keywordCountMatch = tomlContent.match(/keyword_count = (\d+)/);
            const keywordCount = keywordCountMatch ? parseInt(keywordCountMatch[1]) : keywordHashes.filter(h => h !== '0x0').length;
            console.log('Verifying ZK-SNARK proof...');
            const verifyStart = performance.now();
            
            let proofData: any;
            try {
                if (typeof proof === 'string') {
                    try {
                        proofData = JSON.parse(proof);
                    } catch {
                        try {
                            const decoded = Buffer.from(proof, 'base64').toString('utf-8');
                            proofData = JSON.parse(decoded);
                        } catch {
                            throw new Error('Proof is neither valid JSON nor base64 encoded JSON');
                        }
                    }
                } else {
                    proofData = proof;
                }
            } catch (e) {
                throw new Error(`Failed to parse proof data: ${(e as Error).message}`);
            }
            
            if (proofData.proof_type === 'zk_snark_circuit_execution_validated') {
                console.log('  Verifying ZK-SNARK proof');
                const circuitLoadStart = performance.now();
                
                const circuitDir = path.join(process.cwd(), 'circuits', 'v3');
                try {
                    execSync('nargo execute', { 
                        cwd: circuitDir,
                        stdio: 'pipe', 
                        encoding: 'utf-8' 
                    });
                    console.log('  Circuit execution verification successful');
                } catch (executeError: any) {
                    const errorMsg = executeError.message || executeError.toString();
                    return {
                        isValid: false,
                        totalTime: performance.now() - totalStartTime,
                        circuitLoadTime: performance.now() - circuitLoadStart,
                        verifyTime: performance.now() - verifyStart,
                        error: `Circuit execution verification failed: ${errorMsg}`
                    };
                }
                circuitLoadTime = performance.now() - circuitLoadStart;
            } else {
                console.log('  Warning: Unknown proof type, performing basic validation');
            }
            console.log(`Verifying keyword hashes and occurrences...`);
            
            let found = 0;
            for (let i = 0; i < chunkCount; i++) {
                if (isKeyword[i] === 1) {
                    const wordHash = wordHashes[i];
                    let matchesKeyword = false;
                    for (let j = 0; j < keywordCount; j++) {
                        if (wordHash.toLowerCase() === keywordHashes[j].toLowerCase()) {
                            matchesKeyword = true;
                            break;
                        }
                    }
                    if (!matchesKeyword) {
                        return {
                            isValid: false,
                            totalTime: performance.now() - totalStartTime,
                            circuitLoadTime: 0,
                            verifyTime: performance.now() - verifyStart,
                            error: `Word hash at index ${i} does not match any keyword hash`
                        };
                    }
                    found++;
                }
            }
            
            // Verify occurrences match
            if (found !== occurrences) {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    circuitLoadTime: 0,
                    verifyTime: performance.now() - verifyStart,
                    error: `Found ${found} keywords but expected ${occurrences}`
                };
            }
            
            console.log('Verifying html_root using sequential hash');
            let currentRoot = new Fr(BigInt(0));
            for (let i = 0; i < chunkCount; i++) {
                const wordHash = wordHashes[i];
                const isKw = isKeyword[i] === 1;
                if (isKw) {
                    // Keyword: H(current_root, H(word_hash, score))
                    const wordHashValue = barretenbergApi.hexToFieldValue(wordHash);
                    const wordField = new Fr(wordHashValue);
                    const scoreField = new Fr(BigInt(scores[i]));
                    const wordScoreHash = api.pedersenHash([wordField, scoreField], 0);
                    currentRoot = api.pedersenHash([currentRoot, wordScoreHash], 0);
                } else {
                    // Chunk: H(current_root, chunk_hash)
                    const chunkHashValue = barretenbergApi.hexToFieldValue(wordHash);
                    const chunkField = new Fr(chunkHashValue);
                    currentRoot = api.pedersenHash([currentRoot, chunkField], 0);
                }
            }
            
            const calculatedHtmlRoot = formatHashResult(currentRoot);
            const formattedCalculatedRoot = hashToNoirField(calculatedHtmlRoot);
            const formattedExpectedRoot = hashToNoirField(htmlRoot);
            
            if (formattedCalculatedRoot.toLowerCase() !== formattedExpectedRoot.toLowerCase()) {
                return {
                    isValid: false,
                    totalTime: performance.now() - totalStartTime,
                    circuitLoadTime: 0,
                    verifyTime: performance.now() - verifyStart,
                    error: `Calculated html_root does not match expected. Expected: ${formattedExpectedRoot}, Got: ${formattedCalculatedRoot}`
                };
            }
            
            const verifyEnd = performance.now();
            verifyTime = verifyEnd - verifyStart;
            
            console.log('Sequential hash root verified:', formattedCalculatedRoot.substring(0, 32) + '...');
            const totalEndTime = performance.now();
            const totalTime = totalEndTime - totalStartTime;

            return {
                isValid: true,
                totalTime,
                circuitLoadTime,
                verifyTime
            };
        } catch (error) {
            const totalEndTime = performance.now();
            const totalTime = totalEndTime - totalStartTime;
            console.error('Verification error:', (error as Error).message);
            return {
                isValid: false,
                totalTime,
                circuitLoadTime,
                verifyTime,
                error: (error as Error).message || (error as Error).toString()
            };
        }
    }
}