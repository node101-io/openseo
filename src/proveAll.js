import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { sanitizeText, TAG_WEIGHTS, hashKeyword } from './teleportationHash.js';
import { buildTeleportationTree } from './teleportationHash.js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import toml from 'toml';
async function generateZKProof() {
    try {
        const circuitPath = path.join(process.cwd(), 'target', 'zkseo.json');
        const circuitData = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
        
        const proverTomlPath = path.join(process.cwd(), 'Prover.toml');
        const proverTomlContent = fs.readFileSync(proverTomlPath, 'utf-8');
        const inputs = toml.parse(proverTomlContent);

        //generate witness 
        const noir = new Noir(circuitData);
        const { witness } = await noir.execute(inputs);        
        const backend = new UltraHonkBackend(circuitData.bytecode);
        //generate proof
        const proofData = await backend.generateProof(witness);
        let proofSize = 0;
        if (proofData.proof) {
            if (Array.isArray(proofData.proof)) {
                proofSize = proofData.proof.length * 32;
            } else if (typeof proofData.proof === 'string') {
                proofSize = Buffer.from(proofData.proof, 'hex').length;
            } else {
                proofSize = JSON.stringify(proofData.proof).length;
            }
        }
        
        return {
            proof: proofData.proof,
            publicInputs: proofData.publicInputs,
            success: true,
            proofSize: proofSize
        };
    } catch (error) {
        console.error('Proof generation failed:', error.message);
        console.error(' Full error:', error);
        return {
            success: false,
            error: error.message || error.toString()
        };
    }
}

async function verifyZKProof(proof, publicInputs) {
    try {
        const circuitPath = path.join(process.cwd(), 'target', 'zkseo.json');
        const circuitData = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
        const backend = new UltraHonkBackend(circuitData.bytecode);
        const isValid = await backend.verifyProof({
            proof,
            publicInputs
        });
        return isValid;
    } catch (error) {
        console.error('Proof verification failed:', error.message);
        return false;
    }
}

function normalizeKeyword(keyword) {
    if (typeof keyword !== 'string') {
        return '';
    }
    const sanitized = sanitizeText(keyword);
    if (sanitized.length === 0) {
        return '';
    }
    const [firstToken] = sanitized.split(' ');
    return firstToken ?? '';
}

async function extractDocumentData(htmlContent, targetKeywords = []) {
    const treeStartTime = performance.now();
    const wordMap = new Map();
    
    for (const keyword of targetKeywords) {
        const normalized = sanitizeText(keyword);
        if (!normalized) continue;
        
        const teleportationTree = await buildTeleportationTree(htmlContent, normalized);
        
        if (teleportationTree.occurrences === 0) {
            continue;
        }
        
        const keywordHash = hashKeyword(normalized);
        
        wordMap.set(normalized, {
            keywordHash,
            chunks: teleportationTree.chunks,
            chunkCount: teleportationTree.chunks.length,
            expectedOccurrences: teleportationTree.occurrences,
            merkleRoot: teleportationTree.root,
            leaves: teleportationTree.leaves,
            weightedScore: teleportationTree.weightedScore || 0,
            totalNodes: teleportationTree.totalNodes || 0,
            leafCount: teleportationTree.leafCount || 0,
            internalNodes: teleportationTree.internalNodes || 0
        });
    }

    const treeEndTime = performance.now();
    const treeConversionTime = treeEndTime - treeStartTime;
    
    console.log(`\nTeleportation Tree Conversion Complete:`);
    console.log(`  Type: Teleportation Tree`);
    console.log(`  Time: ${treeConversionTime.toFixed(2)}ms`);

    return { 
        wordMap,
        treeConversionTime
    };
}

function hashToNoirField(hexHash) {
    if (hexHash === '0x0' || hexHash === '0x00' || !hexHash) {
        return '0x0';
    }
    const cleanHex = hexHash.replace(/^0x/, '').toLowerCase();
    if (!cleanHex || cleanHex.length === 0) {
        return '0x0';
    }
    const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    let hashValue = BigInt('0x' + cleanHex);
    hashValue = hashValue % FIELD_MODULUS;
    const hexStr = hashValue.toString(16).toLowerCase();
    const paddedHex = hexStr.padStart(64, '0');
    return '0x' + paddedHex;
}

function generateProverToml({
    word,
    merkleRoot,
    keywordHash,
    chunks,
    chunkCount,
    expectedOccurrences
}) {
    const merkleRootField = hashToNoirField(merkleRoot);
    const keywordField = hashToNoirField(keywordHash);
    
    let toml = `# ZK-SEO Teleportation Tree Prover Input\n`;
    toml += `# Keyword: "${word}"\n`;
    toml += `# Chunks: ${chunkCount}\n`;
    toml += `# Expected occurrences: ${expectedOccurrences}\n\n`;
    
    toml += `keyword_hash = "${keywordField}"\n`;
    toml += `merkle_root = "${merkleRootField}"\n`;
    toml += `chunk_count = ${chunkCount}\n`;
    toml += `expected_occurrences = ${expectedOccurrences}\n\n`;
    
    const leafHashesArray = [];
    const isKeywordArray = [];
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        leafHashesArray.push(`"${hashToNoirField(chunk.hash)}"`);
        isKeywordArray.push(chunk.type === 'keyword' ? 1 : 0);
    }
    
    const MAX_CHUNKS = 32;
    for (let i = chunks.length; i < MAX_CHUNKS; i++) {
        leafHashesArray.push(`"0x0"`);
        isKeywordArray.push(0);
    }
    
    toml += `leaf_hashes = [${leafHashesArray.join(', ')}]\n`;
    toml += `is_keyword = [${isKeywordArray.join(', ')}]\n`;

    return toml;
}

function executeCommand(command) {
    return execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
}

async function generateProofForKeyword({
    word,
    keywordHash,
    chunks = [],
    chunkCount,
    expectedOccurrences,
    merkleRoot,
    weightedScore = 0,
    totalNodes = 0,
    outputDir
}) {
    console.log(`Keyword: ${word}`);
    console.log(`Keyword Hash: ${keywordHash}`);
    console.log(`Chunks: ${chunkCount}`);
    console.log(`Expected Occurrences: ${expectedOccurrences}`);
    
    if (chunkCount > 32) {
        throw new Error(`Keyword "${word}" has ${chunkCount} chunks which exceeds MAX_CHUNKS (32).`);
    }

    const toml = generateProverToml({
        word,
        merkleRoot,
        keywordHash,
        chunks,
        chunkCount,
        expectedOccurrences
    });

    fs.writeFileSync('Prover.toml', toml);

        try {
            const proofStartTime = performance.now();
            executeCommand('nargo compile');        
            const proofResult = await generateZKProof();
            let isVerified = false;
            let zkProof = null;
            let verificationTime = 0;
            let proofSize = 0;
            
            if (proofResult.success && proofResult.proof && proofResult.publicInputs) {
                const verifyStartTime = performance.now();
                try {
                    isVerified = await verifyZKProof(proofResult.proof, proofResult.publicInputs);
                } catch (verifyError) {
                    console.error('Verification error:', verifyError.message);
                    isVerified = false;
                }
                const verifyEndTime = performance.now();
                verificationTime = verifyEndTime - verifyStartTime;
                
                if (proofResult.proofSize) {
                    proofSize = proofResult.proofSize;
                } else if (proofResult.proof) {
                    if (proofResult.proof instanceof Uint8Array) {
                        proofSize = proofResult.proof.length;
                    } else if (Array.isArray(proofResult.proof)) {
                        proofSize = proofResult.proof.length * 32;
                    } else if (typeof proofResult.proof === 'string') {
                        proofSize = Buffer.from(proofResult.proof.replace(/^0x/, ''), 'hex').length;
                    } else {
                        proofSize = Buffer.from(JSON.stringify(proofResult.proof)).length;
                    }
                }
                
                zkProof = {
                    proof: Array.isArray(proofResult.proof) ? Array.from(proofResult.proof) : proofResult.proof,
                    publicInputs: Array.isArray(proofResult.publicInputs) ? Array.from(proofResult.publicInputs) : proofResult.publicInputs
                };
            } else {
                console.error('Proof generation failed, skipping verification');
            }
            const proofEndTime = performance.now();
            const proofGenerationTime = proofEndTime - proofStartTime;

        const outputFileName = `output_${word}.json`;
        const outputPath = path.join(outputDir, outputFileName);

        const proofData = {
            keyword: word,
            keyword_hash: keywordHash,
            occurrences: expectedOccurrences,
            weighted_score: weightedScore,
            merkle_root: merkleRoot,
            chunks: chunks,
            chunk_count: chunkCount,
            expected_occurrences: expectedOccurrences,
            merkle_tree_nodes: totalNodes,
            proof_generated: proofResult.success,
            proof_verified: isVerified,
            proof_generation_time_ms: proofGenerationTime,
            verification_time_ms: verificationTime,
            proof_size_bytes: proofSize,
            proof_type: 'Noir PLONK Proof with Barretenberg Backend',
            proof_data: zkProof,
            timestamp: new Date().toISOString(),
            backend: '@aztec/bb.js'
        };

        fs.writeFileSync(outputPath, JSON.stringify(proofData, null, 2));

        console.log(`Output: ${outputFileName}`);
        console.log(`Occurrences: ${expectedOccurrences}`);
        console.log(`Proof Generation Time: ${proofGenerationTime.toFixed(2)}ms`);
        console.log(`Verification Time: ${verificationTime.toFixed(2)}ms`);
        console.log(`Proof Size: ${proofSize} bytes`);
        console.log(`Proof Verified: ${isVerified ? 'YES' : 'NO'}`);

        return {
            word,
            occurrences: expectedOccurrences,
            weightedScore,
            totalNodes,
            success: true,
            verified: isVerified,
            output_file: outputFileName,
            keyword_hash: keywordHash,
            chunk_count: chunkCount,
            proofGenerationTime,
            verificationTime,
            proofSize
        };
    } catch (error) {
        console.error(`Failed to create proof: ${error.message}`);

        const outputFileName = `output_${word}_error.json`;
        const outputPath = path.join(outputDir, outputFileName);

        const errorData = {
            keyword: word,
            keyword_hash: keywordHash,
            occurrences: expectedOccurrences,
            merkle_root: merkleRoot,
            chunk_count: chunkCount,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(outputPath, JSON.stringify(errorData, null, 2));

        return {
            word,
            occurrences: expectedOccurrences,
            success: false,
            error: error.message,
            verified: false,
            keyword_hash: keywordHash,
            chunk_count: chunkCount
        };
    }
}

export async function proveAllWords(htmlFilePathOrContent, targetKeywordInput = '', isDirectContent = false, outputDirPrefix = null) {
    const startedAt = Date.now();
    
    const htmlContent = isDirectContent 
        ? htmlFilePathOrContent 
        : fs.readFileSync(htmlFilePathOrContent, 'utf-8');
    
    const keywordInputs = targetKeywordInput.trim().split(/[\s,]+/).filter(k => k.length > 0);
    
    if (keywordInputs.length === 0) {
        throw new Error('At least one keyword is required for verification.');
    }
    
    const normalizedKeywords = keywordInputs.map(k => sanitizeText(k)).filter(k => k.length > 0);
    const { wordMap, treeConversionTime } = await extractDocumentData(htmlContent, normalizedKeywords);

    const entriesToProcess = [];
    const foundKeywords = [];
    const notFoundKeywords = [];
    
    for (const keywordInput of keywordInputs) {
        const normalized = normalizeKeyword(keywordInput);
        if (!normalized) {
            console.warn(`Skipping invalid keyword: "${keywordInput}"`);
            continue;
        }
        
        if (!wordMap.has(normalized)) {
            notFoundKeywords.push(normalized);
            console.warn(`Keyword "${normalized}" not found in HTML`);
            continue;
        }
        
        foundKeywords.push(normalized);
        entriesToProcess.push([normalized, wordMap.get(normalized)]);
    }
    
    if (entriesToProcess.length === 0) {
        throw new Error(`None of the provided keywords were found in the HTML document. Not found: ${notFoundKeywords.join(', ')}`);
    }
    
    const firstEntry = entriesToProcess[0];
    const merkleRoot = firstEntry[1].merkleRoot || '0x0';

    let outputDir;
    if (outputDirPrefix) {
        outputDir = outputDirPrefix;
    } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        outputDir = `proofs_batch_${timestamp}`;
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const teleportationTreeData = {};
    for (const [word, data] of entriesToProcess) {
        teleportationTreeData[word] = {
            chunks: data.chunks,
            chunkCount: data.chunkCount,
            expectedOccurrences: data.expectedOccurrences,
            merkleRoot: data.merkleRoot,
            leaves: data.leaves
        };
    }
    const teleportationTreePath = path.join(outputDir, 'teleportation_tree.json');
    fs.writeFileSync(teleportationTreePath, JSON.stringify(teleportationTreeData, null, 2));

    const results = [];
    let totalProofTime = 0;
    let totalVerificationTime = 0;
    let totalProofSize = 0;
    
    for (const [word, data] of entriesToProcess) {
        const result = await generateProofForKeyword({
            word,
            keywordHash: data.keywordHash,
            chunks: data.chunks,
            chunkCount: data.chunkCount,
            expectedOccurrences: data.expectedOccurrences,
            merkleRoot: data.merkleRoot,
            weightedScore: data.weightedScore || 0,
            totalNodes: data.totalNodes || 0,
            outputDir
        });

        if (result.proofGenerationTime) {
            totalProofTime += result.proofGenerationTime;
        }
        if (result.verificationTime) {
            totalVerificationTime += result.verificationTime;
        }
        if (result.proofSize) {
            totalProofSize += result.proofSize;
        }

        results.push({
            ...result,
            keyword_hash: data.keywordHash,
            chunk_count: data.chunkCount
        });
    }

    const totalOccurrences = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.occurrences || 0), 0);
    
    const totalWeightedScore = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.weightedScore || 0), 0);
    
    const totalMerkleNodes = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.totalNodes || 0), 0);

    const summary = {
        timestamp: new Date().toISOString(),
        html_file: isDirectContent ? 'Uploaded HTML Content' : htmlFilePathOrContent,
        merkle_tree_type: 'teleportation',
        merkle_tree_conversion_time_ms: treeConversionTime,
        total_proof_generation_time_ms: totalProofTime,
        total_verification_time_ms: totalVerificationTime,
        total_proof_size_bytes: totalProofSize,
        merkle_root_hash: merkleRoot,
        teleportation_tree_file: teleportationTreePath,
        unique_keywords: wordMap.size,
        keywords_processed: entriesToProcess.length,
        keywords_found: foundKeywords,
        keywords_not_found: notFoundKeywords,
        total_words: entriesToProcess.length,
        total_occurrences: totalOccurrences,
        successful_proofs: results.filter(r => r.success).length,
        failed_proofs: results.filter(r => !r.success).length,
        verified_proofs: results.filter(r => r.verified).length,
        total_weighted_zk_score: totalWeightedScore,
        total_merkle_tree_nodes: totalMerkleNodes,
        processing_time_ms: Date.now() - startedAt,
        output_directory: outputDir,
        tag_weights: TAG_WEIGHTS,
        performance_metrics: {
            tree_type: 'teleportation',
            tree_conversion_time_ms: treeConversionTime,
            proof_generation_time_ms: totalProofTime,
            verification_time_ms: totalVerificationTime,
            proof_size_bytes: totalProofSize,
            total_time_ms: Date.now() - startedAt
        },
        results
    };

    const summaryPath = path.join(outputDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    summary.summary_path = summaryPath;

    console.log(`\n=== Performance Summary ===`);
    console.log(`Merkle Tree Type: Teleportation Tree`);
    console.log(`Tree Conversion Time: ${treeConversionTime.toFixed(2)}ms`);
    console.log(`Total Proof Generation Time: ${totalProofTime.toFixed(2)}ms`);
    console.log(`Total Verification Time: ${totalVerificationTime.toFixed(2)}ms`);
    console.log(`Total Proof Size: ${totalProofSize} bytes`);
    console.log(`Total Processing Time: ${(Date.now() - startedAt).toFixed(2)}ms`);
    console.log(`Merkle Root Hash: ${merkleRoot.substring(0, 32)}...`);
    console.log(`Target Keywords: ${foundKeywords.join(', ')}`);
    console.log(`Total Occurrences: ${totalOccurrences}`);
    console.log(`Total Weighted ZK Score: ${totalWeightedScore}`);
    console.log(`Total Merkle Tree Nodes: ${totalMerkleNodes}`);
    return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node src/proveAll.js <html> <keywords>');
        process.exit(1);
    }

    const htmlFile = args[0];
    const keywordInput = args.slice(1).join(' ');  
    
    (async () => {
        try {
            await proveAllWords(htmlFile, keywordInput, false);
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}