import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { parseHTMLToMerkleTree, sanitizeText, TAG_WEIGHTS } from './parse.js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import toml from 'toml';

const MAX_WITNESS_NODES = 32;
const MAX_PATH_DEPTH = 10;
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
        return {
            proof: proofData.proof,
            publicInputs: proofData.publicInputs,
            success: true,
            proofSize: proofData.proof.length
        };
    } catch (error) {
        console.error('    ✗ Proof generation failed:', error.message);
        console.error('    ✗ Full error:', error);
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
        console.error('    ✗ Proof verification failed:', error.message);
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

function extractDocumentData(htmlContent) {
    const merkleTree = parseHTMLToMerkleTree(htmlContent);
    const wordMap = new Map();
    
    for (const [keyword, locations] of merkleTree.keywordIndex.entries()) {
        const witnessData = merkleTree.buildWitnessArray(keyword);
        
        if (witnessData.witnessCount > MAX_WITNESS_NODES) {
            console.warn(`Keyword "${keyword}" has ${witnessData.witnessCount} matches which exceeds MAX_WITNESS_NODES (${MAX_WITNESS_NODES}), skipping.`);
            continue;
        }

        const sources = witnessData.matchingNodes.map(n => n.tag);
        const weights = witnessData.matchingNodes.map(n => n.weight);
        const hashes = witnessData.matchingNodes.map(n => n.contentHash);

        wordMap.set(keyword, {
            keywordHash: witnessData.keywordHash,
            witnessPaths: witnessData.witnessPaths, 
            witnessCount: witnessData.witnessCount,
            matchingNodes: witnessData.matchingNodes,
            sources,
            weights,
            hashes,
            weightedScore: merkleTree.getKeywordScore(keyword),
            details: merkleTree.getKeywordDetails(keyword)
        });
    }

    return { 
        wordMap, 
        merkleTree,
        stats: merkleTree.getStats()
    };
}

function padArray(values, targetLength, padValue) {
    if (values.length > targetLength) {
        throw new Error(`Value count ${values.length} exceeds maximum ${targetLength}.`);
    }
    return [...values, ...Array(targetLength - values.length).fill(padValue)];
}

function hashToNoirField(hexHash) {
    const cleanHex = hexHash.replace(/^0x/, '');
    const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    let hashValue = BigInt('0x' + cleanHex);
    hashValue = hashValue % FIELD_MODULUS;
    return '0x' + hashValue.toString(16);
}

function generateProverToml({
    word,
    merkleRoot,
    keywordHash,
    witnessPaths,
    witnessCount
}) {
    const merkleRootField = hashToNoirField(merkleRoot);
    const keywordField = hashToNoirField(keywordHash);
    
    // Build witness_paths array: [[Field; MAX_PATH_DEPTH]; MAX_WITNESS_NODES]
    const paddedPaths = [];
    const pathLengths = [];
    
    for (let i = 0; i < MAX_WITNESS_NODES; i++) {
        if (i < witnessPaths.length) {
            const path = witnessPaths[i].path;
            const paddedPath = padArray(path, MAX_PATH_DEPTH, '0x0');
            paddedPaths.push(paddedPath);
            pathLengths.push(path.length);
        } else {
            paddedPaths.push(Array(MAX_PATH_DEPTH).fill('0x0'));
            pathLengths.push(0);
        }
    }
    
    const pathsString = paddedPaths
        .map(path => {
            const pathStr = path.map(h => `"${hashToNoirField(h)}"`).join(', ');
            return `[${pathStr}]`;
        })
        .join(',\n  ');
    
    // Format path_lengths
    const lengthsString = pathLengths
        .map(len => `"${len}"`)
        .join(', ');

    let toml = `# ZK-SEO Merkle Path Prover Input\n`;
    toml += `# Keyword: "${word}"\n`;
    toml += `# Matches found: ${witnessCount}\n\n`;
    toml += `HTML_merkle_root = "${merkleRootField}"\n`;
    toml += `keyword = "${keywordField}"\n`;
    toml += `witness_count = "${witnessCount}"\n\n`;
    toml += `witness_paths = [\n  ${pathsString}\n]\n\n`;
    toml += `path_lengths = [${lengthsString}]\n`;

    return toml;
}

function executeCommand(command) {
    return execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
}

async function generateProofForKeyword({
    word,
    keywordHash,
    witnessPaths = [],
    witnessCount,
    merkleRoot,
    sources = [],
    weights = [],
    hashes = [],
    weightedScore = 0,
    details = null,
    outputDir
}) {
    console.log(`  Keyword Hash: ${keywordHash}`);

    if (witnessCount > MAX_WITNESS_NODES) {
        throw new Error(`Keyword "${word}" has ${witnessCount} matches which exceeds MAX_WITNESS_NODES (${MAX_WITNESS_NODES}).`);
    }

    const toml = generateProverToml({
        word,
        merkleRoot,
        keywordHash,
        witnessPaths,
        witnessCount
    });

    fs.writeFileSync('Prover.toml', toml);

    try {
        executeCommand('nargo compile');        
        const proofResult = await generateZKProof();
        let isVerified = false;
        let zkProof = null;
        
        if (proofResult.success) {
            isVerified = await verifyZKProof(proofResult.proof, proofResult.publicInputs);
            zkProof = {
                proof: Array.from(proofResult.proof),
                publicInputs: Array.from(proofResult.publicInputs)
            };
        }

        const outputFileName = `output_${word}.json`;
        const outputPath = path.join(outputDir, outputFileName);

        //tag distribution for word h2-> 3, h3->6
        const tagDistribution = {};
        sources.forEach(tag => {
            tagDistribution[tag] = (tagDistribution[tag] || 0) + 1;
        });

        const proofData = {
            keyword: word,
            keyword_hash: keywordHash,
            occurrences: witnessCount,
            weighted_score: weightedScore,
            merkle_root: merkleRoot,
            witness_paths: witnessPaths,  
            witness_count: witnessCount,
            tags: sources,
            weights,
            content_hashes: hashes,
            tag_distribution: tagDistribution,
            details,
            proof_generated: proofResult.success,
            proof_verified: isVerified,
            proof_type: 'Noir PLONK Proof with Barretenberg Backend',
            proof_data: zkProof,
            timestamp: new Date().toISOString(),
            backend: '@aztec/bb.js'
        };

        fs.writeFileSync(outputPath, JSON.stringify(proofData, null, 2));

        console.log(`Output: ${outputFileName}`);
        console.log(`Weighted ZK Score: ${weightedScore}`);
        console.log(`Proof Verified: ${isVerified ? 'YES' : 'NO'}`);

        return {
            word,
            score: weightedScore,
            occurrences: witnessCount,
            success: true,
            verified: isVerified,
            output_file: outputFileName,
            keyword_hash: keywordHash,
            witness_count: witnessCount,
            sources,
            weights,
            tagDistribution,
            details
        };
    } catch (error) {
        console.error(`Failed to create proof: ${error.message}`);

        const outputFileName = `output_${word}_error.json`;
        const outputPath = path.join(outputDir, outputFileName);

        const errorData = {
            keyword: word,
            keyword_hash: keywordHash,
            occurrences: witnessCount,
            weighted_score: weightedScore,
            merkle_root: merkleRoot,
            witness_count: witnessCount,
            tags: sources,
            weights,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(outputPath, JSON.stringify(errorData, null, 2));

        return {
            word,
            score: weightedScore,
            occurrences: witnessCount,
            success: false,
            error: error.message,
            verified: false,
            keyword_hash: keywordHash,
            witness_count: witnessCount,
            sources,
            weights
        };
    }
}

export async function proveAllWords(htmlFilePathOrContent, targetKeywordInput = '', isDirectContent = false) {
    const startedAt = Date.now();
    
    const htmlContent = isDirectContent 
        ? htmlFilePathOrContent 
        : fs.readFileSync(htmlFilePathOrContent, 'utf-8');
    const { wordMap, merkleTree, stats } = extractDocumentData(htmlContent);
    const merkleRoot = stats.rootHash || '0x0';

    console.log(`\nMerkle Tree Statistics:`);
    console.log(`  Root Hash: ${merkleRoot.substring(0, 16)}...`);
    console.log(`  Unique Keywords: ${stats.totalKeywords}`);
    const keywordInputs = targetKeywordInput.trim().split(/[\s,]+/).filter(k => k.length > 0);
    
    if (keywordInputs.length === 0) {
        throw new Error('At least one keyword is required for verification.');
    }

    const entriesToProcess = [];
    const foundKeywords = [];
    const notFoundKeywords = [];
    
    for (const keywordInput of keywordInputs) {
        const normalized = normalizeKeyword(keywordInput);
        if (!normalized) {
            console.warn(`⚠️  Skipping invalid keyword: "${keywordInput}"`);
            continue;
        }
        
        if (!wordMap.has(normalized)) {
            notFoundKeywords.push(normalized);
            console.warn(`❌ Keyword "${normalized}" not found in HTML`);
            continue;
        }
        
        foundKeywords.push(normalized);
        entriesToProcess.push([normalized, wordMap.get(normalized)]);
    }
    
    if (entriesToProcess.length === 0) {
        throw new Error(`None of the provided keywords were found in the HTML document. Not found: ${notFoundKeywords.join(', ')}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `proofs_batch_${timestamp}`;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const merkleTreePath = path.join(outputDir, 'merkle_tree.json');
    fs.writeFileSync(merkleTreePath, JSON.stringify(merkleTree.toJSON(), null, 2));

    const results = [];
    for (const [word, data] of entriesToProcess) {
        const result = await generateProofForKeyword({
            word,
            keywordHash: data.keywordHash,
            witnessPaths: data.witnessPaths,
            witnessCount: data.witnessCount,
            merkleRoot,
            sources: data.sources,
            weights: data.weights,
            hashes: data.hashes,
            weightedScore: data.weightedScore,
            details: data.details,
            outputDir
        });

        results.push({
            ...result,
            keyword_hash: data.keywordHash,
            witness_count: data.witnessCount,
            sources: [...data.sources],
            weights: [...data.weights]
        });
    }

    const totalScore = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.score, 0);

    const totalOccurrences = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.occurrences || 0), 0);

    const summary = {
        timestamp: new Date().toISOString(),
        html_file: isDirectContent ? 'Uploaded HTML Content' : htmlFilePathOrContent,
        merkle_tree_stats: stats,
        merkle_root_hash: merkleRoot,
        merkle_tree_file: merkleTreePath,
        unique_keywords: wordMap.size,
        keywords_processed: entriesToProcess.length,
        target_keywords: foundKeywords,  
        keywords_found: foundKeywords,
        keywords_not_found: notFoundKeywords,
        total_words: entriesToProcess.length,
        total_occurrences: totalOccurrences,
        successful_proofs: results.filter(r => r.success).length,
        failed_proofs: results.filter(r => !r.success).length,
        verified_proofs: results.filter(r => r.verified).length,
        total_weighted_zk_score: totalScore,
        processing_time_ms: Date.now() - startedAt,
        output_directory: outputDir,
        tag_weights: TAG_WEIGHTS,
        results
    };

    const summaryPath = path.join(outputDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    summary.summary_path = summaryPath;

    console.log(`Merkle Root Hash: ${merkleRoot.substring(0, 32)}...`);
    console.log(`Target Keywords: ${foundKeywords.join(', ')}`);
    console.log(`Total Weighted ZK Score: ${totalScore}`);
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