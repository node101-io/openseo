import { JSDOM } from 'jsdom';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const MAX_CHARS = 2048; 
const MAX_KEYWORD_LENGTH = 32;
const MAX_MATCHES = 128;

const NON_ALLOWED_CHAR_REGEX = /[^a-z0-9\sığüşöç]/g;
const WHITESPACE_REGEX = /\s+/g;

function sanitizeText(text) {
    return text
        .toLowerCase()
        .replace(NON_ALLOWED_CHAR_REGEX, ' ')
        .replace(WHITESPACE_REGEX, ' ')
        .trim();
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
    const dom = new JSDOM(htmlContent);
    const { document } = dom.window;

    const metaElements = Array.from(document.getElementsByTagName('meta'));
    const metaEntries = [];

    for (const meta of metaElements) {
        const contentAttr = meta.getAttribute('content');
        if (!contentAttr) {
            continue;
        }

        const sanitizedContent = sanitizeText(contentAttr);
        if (!sanitizedContent) {
            continue;
        }

        const label = meta.getAttribute('name');
        metaEntries.push({
            label,
            text: sanitizedContent
        });
    }

    const documentText = metaEntries.map(entry => entry.text).join(' ');
    const documentChars = Array.from(documentText).map(char => BigInt(char.charCodeAt(0)));

    if (documentChars.length > MAX_CHARS) {
        throw new Error(`Meta content contains ${documentChars.length} characters which exceeds the maximum supported ${MAX_CHARS}.`);
    }

    const wordMap = new Map();

    let cursor = 0;
    for (let idx = 0; idx < metaEntries.length; idx++) {
        const { text, label } = metaEntries[idx];
        const tokens = text.split(' ');
        let offset = 0;

        for (const token of tokens) {
            if (token.length === 0) {
                continue;
            }

            if (!wordMap.has(token)) {
                const keywordChars = Array.from(token).map(char => BigInt(char.charCodeAt(0)));
                if (keywordChars.length > MAX_KEYWORD_LENGTH) {
                    throw new Error(`Keyword "${token}" exceeds maximum supported length ${MAX_KEYWORD_LENGTH}.`);
                }

                wordMap.set(token, {
                    keywordChars,
                    indices: [],
                    sources: []
                });
            }

            const entry = wordMap.get(token);
            entry.indices.push(cursor + offset);
            entry.sources.push(label);

            offset += token.length + 1;
        }

        cursor += text.length;
        if (idx < metaEntries.length - 1) {
            cursor += 1; 
        }
    }

    return { documentText, documentChars, wordMap, metaCount: metaEntries.length };
}

function padArray(values, targetLength, padValue) {
    if (values.length > targetLength) {
        throw new Error(`Value count ${values.length} exceeds maximum ${targetLength}.`);
    }
    return [...values, ...Array(targetLength - values.length).fill(padValue)];
}

function arrayToTomlList(values) {
    return values.map(value => value.toString()).join(', ');
}

function generateProverToml({
    word,
    documentLength,
    documentCharsString,
    keywordChars,
    matchIndices,
    expectedScore
}) {
    const keywordLength = keywordChars.length;
    const paddedKeywordChars = padArray(keywordChars, MAX_KEYWORD_LENGTH, 0n);
    const keywordCharsString = arrayToTomlList(paddedKeywordChars);

    const paddedIndices = padArray(matchIndices, MAX_MATCHES, 0);
    const matchIndicesString = paddedIndices.join(', ');

    let toml = `# ZK-SEO Prover Input\n`;
    toml += `keyword = "${word}"\n`;
    toml += `expected_score = ${expectedScore}\n`;
    toml += `document_length = ${documentLength}\n`;
    toml += `keyword_length = ${keywordLength}\n`;
    toml += `index_count = ${matchIndices.length}\n\n`;
    toml += `document_chars = [${documentCharsString}]\n`;
    toml += `keyword_chars = [${keywordCharsString}]\n`;
    toml += `match_indices = [${matchIndicesString}]\n`;

    return toml;
}

function executeCommand(command) {
    return execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
}

function generateProofForKeyword({
    word,
    keywordChars,
    indices,
    sources = [],
    documentCharsString,
    documentLength,
    outputDir
}) {
    console.log(`\nProof is being created: "${word}"`);

    if (indices.length > MAX_MATCHES) {
        throw new Error(`Keyword "${word}" appears ${indices.length} times which exceeds MAX_MATCHES (${MAX_MATCHES}).`);
    }

    const expectedScore = indices.length;
    const toml = generateProverToml({
        word,
        documentLength,
        documentCharsString,
        keywordChars,
        matchIndices: indices,
        expectedScore
    });

    fs.writeFileSync('Prover.toml', toml);

    try {
        executeCommand('nargo compile');
        const executeOutput = executeCommand('nargo execute witness');
        const outputFileName = `output_${word}.json`;
        const outputPath = path.join(outputDir, outputFileName);

        const proofData = {
            keyword: word,
            keyword_length: keywordChars.length,
            indices,
            meta_sources: sources,
            expected_score: expectedScore,
            proof_generated: true,
            proof_type: 'Noir Verification',
            timestamp: new Date().toISOString(),
            execute_output: (executeOutput || '').substring(0, 500)
        };

        fs.writeFileSync(outputPath, JSON.stringify(proofData, null, 2));
        console.log(`Success proof: ${outputFileName}`);

        return {
            word,
            score: expectedScore,
            success: true,
            verified: true,
            output_file: outputFileName,
            indices,
            sources
        };
    } catch (error) {
        console.error(`Failed to create proof: ${error.message}`);

        const outputFileName = `output_${word}_error.json`;
        const outputPath = path.join(outputDir, outputFileName);

        const errorData = {
            keyword: word,
            keyword_length: keywordChars.length,
            indices,
            meta_sources: sources,
            expected_score: expectedScore,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(outputPath, JSON.stringify(errorData, null, 2));

        return {
            word,
            score: expectedScore,
            success: false,
            error: error.message,
            verified: false,
            indices,
            sources
        };
    }
}

export function proveAllWords(htmlFilePath, targetKeywordInput = '') {
    const startedAt = Date.now();
    console.log('ZK-SEO Verification Generator');

    const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
    const { documentText, documentChars, wordMap, metaCount } = extractDocumentData(htmlContent);

    console.log(`document characters: ${documentChars.length}`);
    console.log(`meta entries processed: ${metaCount}`);
    console.log(`unique keywords in meta: ${wordMap.size}`);

    const targetKeyword = normalizeKeyword(targetKeywordInput);
    if (!targetKeyword) {
        throw new Error('Keyword is required for verification.');
    }

    console.log(`target keyword: "${targetKeyword}"`);
    if (!wordMap.has(targetKeyword)) {
        throw new Error(`Keyword "${targetKeyword}" is not present in the meta tags.`);
    }

    const entriesToProcess = [[targetKeyword, wordMap.get(targetKeyword)]];
    const documentLength = documentChars.length;
    const paddedDocumentChars = padArray(documentChars, MAX_CHARS, 0n);
    const documentCharsString = arrayToTomlList(paddedDocumentChars);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `proofs_batch_${timestamp}`;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const results = [];

    for (const [word, data] of entriesToProcess) {
        console.log(`\nKeyword: "${word}"`);
        console.log(`    occurrences: ${data.indices.length}`);
        console.log(`    indices: ${data.indices.join(', ')}`);
        console.log(`    meta sources: ${data.sources.join(', ')}`);

        const result = generateProofForKeyword({
            word,
            keywordChars: data.keywordChars,
            indices: data.indices,
            sources: data.sources,
            documentCharsString,
            documentLength,
            outputDir
        });

        results.push({
            ...result,
            indices: [...data.indices],
            sources: [...data.sources]
        });
    }

    const totalScore = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.score, 0);

    const summary = {
        timestamp: new Date().toISOString(),
        html_file: htmlFilePath,
        backend: 'Noir (Verification Only)',
        proof_system: 'Noir Character Index Verification',
        document_length: documentLength,
        meta_entries: metaCount,
        unique_keywords: wordMap.size,
        keywords_processed: entriesToProcess.length,
        target_keyword: targetKeyword || null,
        total_words: entriesToProcess.length,
        successful_proofs: results.filter(r => r.success).length,
        failed_proofs: results.filter(r => !r.success).length,
        verified_proofs: results.filter(r => r.verified).length,
        total_zk_score: totalScore,
        processing_time_ms: Date.now() - startedAt,
        output_directory: outputDir,
        results
    };

    const summaryPath = path.join(outputDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    summary.summary_path = summaryPath;
    return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Kullanım: node src/proveAll.js <html-dosyasi> <kelime>');
        console.log('Örnek: node src/proveAll.js example.html seo');
        process.exit(1);
    }
    const [htmlFile, keywordInput] = args;
    proveAllWords(htmlFile, keywordInput);
}