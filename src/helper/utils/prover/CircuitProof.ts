import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ProofResult } from '../common/ProverTypes.js';
import { HashService } from './Hashing.js';
import { HTMLAnalyzer } from './HTMLAnalyzer.js';
import { hashToNoirField } from '../common/hashUtils.js';
import { sanitizeText, getTagWeight } from '../common/textUtils.js';
import { MAX_CHUNKS } from '../common/constants.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { Fr } from '@aztec/bb.js';
import { ProofVerifier } from '../verifier/ProofVerifier.js';

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
            const circuitPath = path.join(process.cwd(), 'target', 'v3.json');
            if (!fs.existsSync(circuitPath)) {
                throw new Error(`Circuit not found at ${circuitPath}. Make sure nargo compile succeeded.`);
            }
            
            const acirBuffer = fs.readFileSync(circuitPath);            
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

            let proofGenerated = false;
            let proofFilePath: string | null = null;
            let witnessFilePath: string | null = null;
            let verificationKeyPath: string | null = null;
            
            try {
                const targetDir = path.join(process.cwd(), 'target');
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                const circuitName = 'v3'; 
                witnessFilePath = path.join(targetDir, `${circuitName}.gz`);
                const proofDir = path.join(targetDir, 'proof');
                proofFilePath = path.join(proofDir, 'proof');
                verificationKeyPath = path.join(targetDir, 'vk');
                try {
                    execSync('nargo execute', {
                        cwd: circuitDir,
                        stdio: 'pipe',
                        encoding: 'utf-8'
                    });
                    
                    const possibleWitnessPaths = [
                        path.join(targetDir, `${circuitName}.gz`), 
                        path.join(targetDir, 'witness.gz'),
                        path.join(targetDir, 'witness'),
                        path.join(circuitDir, 'target', `${circuitName}.gz`),
                        path.join(circuitDir, 'target', 'witness.gz'),
                        path.join(circuitDir, 'target', 'witness')
                    ];
                    
                    let foundWitness = false;
                    for (const witnessPath of possibleWitnessPaths) {
                        if (fs.existsSync(witnessPath)) {
                            witnessFilePath = witnessPath;
                            foundWitness = true;
                            break;
                        }
                    }
                    
                    if (!foundWitness) {
                        throw new Error(`Witness file not found. Checked: ${possibleWitnessPaths.join(', ')}`);
                    }
                } catch (nargoError: any) {
                    console.log(`  nargo execute failed: ${nargoError.message}`);
                    throw new Error(`Failed to create witness file: ${nargoError.message}`);
                }
                
                if (!witnessFilePath || !fs.existsSync(witnessFilePath)) {
                    throw new Error(`Witness file not found at: ${witnessFilePath}`);
                }
                
                if (fs.existsSync(proofDir)) {
                    fs.rmSync(proofDir, { recursive: true, force: true });
                }
                const bbProveCommand = `bb prove -b "${circuitPath}" -w "${witnessFilePath}" -o "${proofDir}" --write_vk`;
                
                const bbOutput = execSync(bbProveCommand, {
                    cwd: process.cwd(),
                    stdio: 'pipe',
                    encoding: 'utf-8'
                });
                
                if (bbOutput) {
                    console.log(`bb output: ${bbOutput.substring(0, 200)}`);
                }
                
                if (fs.existsSync(proofFilePath)) {
                    proofGenerated = true;
                    const proofStats = fs.statSync(proofFilePath);
                    const proofData = fs.readFileSync(proofFilePath);
                    const vkPathInProofDir = path.join(proofDir, 'vk');
                    if (fs.existsSync(vkPathInProofDir)) {
                        verificationKeyPath = vkPathInProofDir;
                    } else {
                        const vkPathInTarget = path.join(targetDir, 'vk');
                        if (fs.existsSync(vkPathInTarget)) {
                            verificationKeyPath = vkPathInTarget;
                        } else {
                            console.log(`  Warning: Verification key not found. Expected at: ${vkPathInProofDir}`);
                        }
                    }
                } else {
                    throw new Error(`Proof file was not created at: ${proofFilePath}`);
                }
            } catch (bbError: any) {
                console.log(`  bb prove failed: ${bbError.message}`);
                if (bbError.stdout) {
                    console.log(`  bb stdout: ${bbError.stdout.substring(0, 500)}`);
                }
                if (bbError.stderr) {
                    console.log(`  bb stderr: ${bbError.stderr.substring(0, 500)}`);
                }
                console.log('  Falling back to circuit execution validation');
                proofGenerated = false;
            }
            
            const proofData: any = {
                circuit_executed: true,
                circuit_path: circuitPath,
                execution_timestamp: new Date().toISOString(),
                proof_type: proofGenerated ? 'zk_snark_proof_generated' : 'zk_snark_circuit_execution_validated',
                public_inputs: publicInputs,
                acir_hash: HashService.hashWordForCircuit(acirBuffer.toString())
            };
            
            if (proofGenerated && proofFilePath && fs.existsSync(proofFilePath)) {
                const proofFileData = fs.readFileSync(proofFilePath);
                proofData.proof_file_path = proofFilePath;
                proofData.proof = proofFileData.toString('base64');
                proofData.proof_size_bytes = proofFileData.length;
                
                if (verificationKeyPath && fs.existsSync(verificationKeyPath)) {
                    proofData.verification_key_path = verificationKeyPath;
                }
            } else {
                proofData.input_hash = HashService.hashWordForCircuit(
                    JSON.stringify({
                        keyword_hashes: keywordHashesFields.map(f => f.toString()),
                        word_hashes: wordHashesFields.map(f => f.toString()),
                        scores: scoresFields.map(f => f.toString()),
                        is_keyword: isKeywordFields.map(f => f.toString()),
                        html_root: htmlRootField.toString(),
                        occurrences: occurrences
                    })
                );
            }
            
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


    export const verifyProof = ProofVerifier.verifyProof;
}