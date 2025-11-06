import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { parseHTMLToMerkleTree, sanitizeText, TAG_WEIGHTS } from './parse.js';

const MAX_WITNESS_NODES = 512;

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
            witnessArray: witnessData.witnessArray,
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

//şurayı iyi anla witness array yollayamadık 
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
    witnessArray,
    witnessCount
}) {
    const merkleRootField = hashToNoirField(merkleRoot);
    const keywordField = hashToNoirField(keywordHash);
    
    const paddedWitness = padArray(witnessArray, MAX_WITNESS_NODES, '0x0');
    const witnessString = paddedWitness
        .map(h => `"${hashToNoirField(h)}"`)
        .join(', ');

    let toml = `# ZK-SEO Hash-Based Prover Input\n`;
    toml += `# Keyword: "${word}"\n`;
    toml += `# Matches found: ${witnessCount}\n\n`;
    toml += `HTML_merkle_root = "${merkleRootField}"\n`;
    toml += `keyword = "${keywordField}"\n`;
    toml += `witness_count = "${witnessCount}"\n\n`;
    toml += `witness_array = [${witnessString}]\n`;

    return toml;
}

function executeCommand(command) {
    return execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
}

function generateProofForKeyword({
    word,
    keywordHash,
    witnessArray,
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
    console.log(`  Witness Count: ${witnessCount}`);
    console.log(`  Merkle Root: ${merkleRoot.substring(0, 16)}...`);

    if (witnessCount > MAX_WITNESS_NODES) {
        throw new Error(`Keyword "${word}" has ${witnessCount} matches which exceeds MAX_WITNESS_NODES (${MAX_WITNESS_NODES}).`);
    }

    const toml = generateProverToml({
        word,
        merkleRoot,
        keywordHash,
        witnessArray,
        witnessCount
    });

    fs.writeFileSync('Prover.toml', toml);

    try {
        executeCommand('nargo compile');
        const executeOutput = executeCommand('nargo execute witness');

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
            witness_array: witnessArray,
            witness_count: witnessCount,
            tags: sources,
            weights,
            content_hashes: hashes,
            tag_distribution: tagDistribution,
            details,
            proof_generated: true,
            proof_type: 'Noir Hash-Based Verification with Merkle Tree',
            timestamp: new Date().toISOString(),
            execute_output: (executeOutput || '').substring(0, 500)
        };

        fs.writeFileSync(outputPath, JSON.stringify(proofData, null, 2));

        console.log(`Success proof: ${outputFileName}`);
        console.log(`Weighted ZK Score: ${weightedScore}`);

        return {
            word,
            score: weightedScore,
            occurrences: witnessCount,
            success: true,
            verified: true,
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

export function proveAllWords(htmlFilePath, targetKeywordInput = '') {
    const startedAt = Date.now();
    console.log('ZK-SEO Hash-Based Verification Generator with Merkle Tree');
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
    const { wordMap, merkleTree, stats } = extractDocumentData(htmlContent);
    const merkleRoot = stats.rootHash || '0x0';

    console.log(`\nMerkle Tree Statistics:`);
    console.log(`  Root Hash: ${merkleRoot.substring(0, 16)}...`);
    console.log(`  Unique Keywords: ${stats.totalKeywords}`);

    const targetKeyword = normalizeKeyword(targetKeywordInput);
    if (!targetKeyword) {
        throw new Error('Keyword is required for verification.');
    }

    if (!wordMap.has(targetKeyword)) {
        throw new Error(`Keyword "${targetKeyword}" is not present in the HTML document.`);
    }

    const entriesToProcess = [[targetKeyword, wordMap.get(targetKeyword)]];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `proofs_batch_${timestamp}`;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const merkleTreePath = path.join(outputDir, 'merkle_tree.json');
    fs.writeFileSync(merkleTreePath, JSON.stringify(merkleTree.toJSON(), null, 2));

    const results = [];
    for (const [word, data] of entriesToProcess) {
        const result = generateProofForKeyword({
            word,
            keywordHash: data.keywordHash,
            witnessArray: data.witnessArray,
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
        html_file: htmlFilePath,
        backend: 'Noir Hash-Based Verification with Merkle Tree',
        proof_system: 'Noir Hash Matching with Tag Weighting',
        merkle_tree_stats: stats,
        merkle_root_hash: merkleRoot,
        merkle_tree_file: merkleTreePath,
        unique_keywords: wordMap.size,
        keywords_processed: entriesToProcess.length,
        target_keyword: targetKeyword || null,
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

    console.log('\n📊 HASH-BASED PROOF GENERATION SUMMARY');
    console.log(`Merkle Tree Nodes: ${stats.totalNodes}`);
    console.log(`Merkle Root Hash: ${merkleRoot.substring(0, 32)}...`);
    console.log(`Unique Keywords: ${summary.unique_keywords}`);
    console.log(`Processed Keywords: ${summary.keywords_processed}`);
    console.log(`Target Keyword: ${targetKeyword}`);
    console.log(`Total Weighted ZK Score: ${totalScore}`);
    return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node src/proveAll.js <html> <word>');
        console.log('Example: node src/proveAll.js example.html seo');
        process.exit(1);
    }

    const [htmlFile, keywordInput] = args;
    proveAllWords(htmlFile, keywordInput);
}