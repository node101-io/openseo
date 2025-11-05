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

function extractMetaTags(htmlContent) {
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

    const wordMap = new Map();

    for (const metaEntry of metaEntries) {
        const { text, label } = metaEntry;
        const tokens = text.split(' ');

        for (const token of tokens) {
            if (token.length === 0) {
                continue;
            }

            if (!wordMap.has(token)) {
                wordMap.set(token, true);
            }
        }
    }

    return { wordMap, metaCount: metaEntries.length };
}

function extractFullDocumentData(htmlContent, keyword) {
    const dom = new JSDOM(htmlContent);
    const { document } = dom.window;
    const bodyElement = document.documentElement;
    const fullText = bodyElement ? bodyElement.textContent || bodyElement.innerText || '' : '';
    const titleElement = document.querySelector('title');
    const titleText = titleElement ? titleElement.textContent || '' : '';
    const allText = (titleText + ' ' + fullText).trim();

    const sanitizedText = sanitizeText(allText);
    
    if (!sanitizedText) {
        throw new Error('No text content found in HTML document.');
    }

    const documentChars = Array.from(sanitizedText).map(char => BigInt(char.charCodeAt(0)));
    if (documentChars.length > MAX_CHARS) {
        throw new Error(`Full document content contains ${documentChars.length} characters which exceeds the maximum supported ${MAX_CHARS}.`);
    }

    const keywordChars = Array.from(keyword).map(char => BigInt(char.charCodeAt(0)));
    if (keywordChars.length > MAX_KEYWORD_LENGTH) {
        throw new Error(`Keyword "${keyword}" exceeds maximum supported length ${MAX_KEYWORD_LENGTH}.`);
    }

    const indices = [];
    const keywordLength = keyword.length;

    for (let i = 0; i <= sanitizedText.length - keywordLength; i++) {
        const substring = sanitizedText.substring(i, i + keywordLength);
        if (substring === keyword) {
            const beforeChar = i > 0 ? sanitizedText[i - 1] : ' ';
            const afterChar = i + keywordLength < sanitizedText.length ? sanitizedText[i + keywordLength] : ' ';
            
            if ((beforeChar === ' ' || i === 0) && (afterChar === ' ' || i + keywordLength === sanitizedText.length)) {
                indices.push(i);
            }
        }
    }

    return {
        documentText: sanitizedText,
        documentChars,
        keywordChars,
        indices
    };
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
    const { wordMap: metaWordMap, metaCount } = extractMetaTags(htmlContent);

    const targetKeyword = normalizeKeyword(targetKeywordInput);
    if (!targetKeyword) {
        throw new Error('Keyword is required for verification.');
    }

    console.log(`target keyword: "${targetKeyword}"`);
    if (!metaWordMap.has(targetKeyword)) {
        throw new Error(`Keyword "${targetKeyword}" is not present in the meta tags.`);
    }

    const { documentText, documentChars, keywordChars, indices } = extractFullDocumentData(htmlContent, targetKeyword);
    console.log(`indices: ${indices.join(', ')}`);

    if (indices.length === 0) {
        throw new Error(`Keyword "${targetKeyword}" was found in meta tags but not found in the full document content.`);
    }

    const documentLength = documentChars.length;
    const paddedDocumentChars = padArray(documentChars, MAX_CHARS, 0n);
    const documentCharsString = arrayToTomlList(paddedDocumentChars);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = `proofs_batch_${timestamp}`;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const results = [];

    console.log(`\nKeyword: "${targetKeyword}"`);
    console.log(`    indices: ${indices.join(', ')}`);

    const result = generateProofForKeyword({
        word: targetKeyword,
        keywordChars,
        indices,
        sources: ['full_document'], 
        documentCharsString,
        documentLength,
        outputDir
    });

    results.push({
        ...result,
        indices: [...indices],
        sources: ['full_document']
    });

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
        unique_keywords_in_meta: metaWordMap.size,
        keywords_processed: results.length,
        target_keyword: targetKeyword || null,
        total_words: results.length,
        successful_proofs: results.filter(r => r.success).length,
        failed_proofs: results.filter(r => !r.success).length,
        verified_proofs: results.filter(r => r.verified).length,
        total_zk_score: totalScore,
        processing_time_ms: Date.now() - startedAt,
        output_directory: outputDir,
        search_strategy: 'meta_tag_then_full_document',
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
        console.log('Usage: node src/proveAll.js <html> <word>');
        console.log('Example: node src/proveAll.js example.html seo');
        process.exit(1);
    }
    const [htmlFile, keywordInput] = args;
    proveAllWords(htmlFile, keywordInput);
}