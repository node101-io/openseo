import { JSDOM } from 'jsdom';
import crypto from 'crypto';
import { BarretenbergSync, Fr } from '@aztec/bb.js';

export const TAG_WEIGHTS = {
    'title': 12,
    'h1': 10,
    'h2': 8,
    'h3': 6,
    'h4': 5,
    'h5': 4,
    'h6': 3,
    'meta': 7,
    'strong': 5,
    'b': 5,
    'i': 4,
    'a': 6,
    'p': 3,
    'span': 2,
    'div': 2,
    'li': 3,
    'td': 2,
    'th': 4,
    'blockquote': 3,
    'code': 3,
    'default': 1
};

const NON_ALLOWED_CHAR_REGEX = /[^a-z0-9\sığüşöç]/g;
const WHITESPACE_REGEX = /\s+/g;

export function sanitizeText(text) {
    return text
        .toLowerCase()
        .replace(NON_ALLOWED_CHAR_REGEX, ' ')
        .replace(WHITESPACE_REGEX, ' ')
        .trim();
}

export function getTagWeight(tagName) {
    const tag = tagName.toLowerCase();
    return TAG_WEIGHTS[tag] || TAG_WEIGHTS['default'];
}

export function hashToField(text) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return '0x' + hash;
}

export function hashKeyword(keyword) {
    const normalized = sanitizeText(keyword);
    return hashToField(normalized);
}

let barretenbergApi = null;
async function getBarretenbergApi() {
    if (!barretenbergApi) {
        barretenbergApi = await BarretenbergSync.initSingleton();
    }
    return barretenbergApi;
}

async function hashPair(left, right) {
    const leftClean = left.replace(/^0x/, '').toLowerCase();
    const rightClean = right.replace(/^0x/, '').toLowerCase();
    const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    
    const leftField = (leftClean && leftClean.length > 0) 
        ? (BigInt('0x' + leftClean) % FIELD_MODULUS) 
        : 0n;
    const rightField = (rightClean && rightClean.length > 0) 
        ? (BigInt('0x' + rightClean) % FIELD_MODULUS) 
        : 0n;
    
    try {
        const api = await getBarretenbergApi();
        const hashResult = api.pedersenHash([new Fr(leftField), new Fr(rightField)], 0);
        const rawResult = hashResult.toString();
        const cleanHex = rawResult.replace(/^0x/, '').toLowerCase();
        const hashValue = BigInt('0x' + cleanHex);
        const hexStr = hashValue.toString(16).toLowerCase();
        const paddedHex = hexStr.padStart(64, '0');
        return '0x' + paddedHex;
    } catch (error) {
        console.error('Pedersen hash failed:', error.message);
        throw error;
    }
}

async function buildMerkleRoot(leafHashes) {
    if (leafHashes.length === 0) {
        return '0x0';
    }
    
    if (leafHashes.length === 1) {
        const cleanHex = leafHashes[0].replace(/^0x/, '').toLowerCase();
        if (!cleanHex || cleanHex.length === 0) {
            return '0x0';
        }
        const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
        const hashValue = BigInt('0x' + cleanHex) % FIELD_MODULUS;
        const hexStr = hashValue.toString(16).toLowerCase();
        const paddedHex = hexStr.padStart(64, '0');
        return '0x' + paddedHex;
    }
    
    const MAX_CHUNKS = 32;
    const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    
    let api;
    try {
        api = await getBarretenbergApi();
    } catch (error) {
        console.error('Failed to initialize Barretenberg API:', error.message);
        throw new Error(`Barretenberg API initialization failed: ${error.message}`);
    }
    
    let layer = [];
    for (let i = 0; i < MAX_CHUNKS; i++) {
        if (i < leafHashes.length) {
            const cleanHex = leafHashes[i].replace(/^0x/, '').toLowerCase();
            if (!cleanHex || cleanHex.length === 0) {
                layer[i] = new Fr(0n);
            } else {
                const hashValue = BigInt('0x' + cleanHex) % FIELD_MODULUS;
                layer[i] = new Fr(hashValue);
            }
        } else {
            layer[i] = new Fr(0n);
        }
    }
    let size = leafHashes.length;
    
    for (let level = 0; level < 6; level++) {
        const next = [];
        for (let j = 0; j < MAX_CHUNKS; j++) {
            next[j] = new Fr(0n);
        }
        let idx = 0;
        const pairs = Math.floor(size / 2);
        
        for (let i = 0; i < MAX_CHUNKS; i++) {
            const shouldProcess = i < pairs;
            if (shouldProcess) {
                const left = layer[i * 2];
                const right = (i * 2 + 1 < size) ? layer[i * 2 + 1] : left;
                
                try {
                    const hashResult = api.pedersenHash([left, right], 0);
                    
                    if (!hashResult) {
                        throw new Error('Null result from pedersenHash');
                    }
                    
                    const resultStr = hashResult.toString();
                    if (resultStr === '0x0' || resultStr === '0' || resultStr === '0x00' || resultStr === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                        throw new Error('Zero result from pedersenHash');
                    }
                    
                    next[idx] = hashResult instanceof Fr ? hashResult : new Fr(BigInt(resultStr.replace(/^0x/, ''), 16));
                } catch (error) {
                    console.error(`Pedersen hash error at level ${level}, pair ${i}:`, error.message);
                    throw new Error(`Pedersen hash failed at level ${level}, pair ${i}: ${error.message}`);
                }
                idx += 1;
            }
        }
        
        if (size % 2 === 1) {
            const lastValue = layer[size - 1];
            try {
                const hashResult = api.pedersenHash([lastValue, lastValue], 0);
                next[idx] = hashResult instanceof Fr ? hashResult : new Fr(BigInt(hashResult.toString().replace(/^0x/, ''), 16));
                idx += 1;
            } catch (error) {
                console.error(`Self-hash failed for last value at level ${level}:`, error.message);
                next[idx] = lastValue;
                idx += 1;
            }
        }
        
        layer = next;
        size = idx;
    }
    
    const rawResult = layer[0].toString();
    const cleanHex = rawResult.replace(/^0x/, '').toLowerCase();
    const hashValue = BigInt('0x' + cleanHex);
    const hexStr = hashValue.toString(16).toLowerCase();
    const paddedHex = hexStr.padStart(64, '0');
    return '0x' + paddedHex;
}

export async function buildTeleportationTree(htmlContent, targetKeyword) {
    const dom = new JSDOM(htmlContent);
    const { document } = dom.window;
    
    const textNodes = [];
    const collectTextNodes = (element, parentTag = 'root', depth = 0) => {
        if (!element) return;
        
        const tagName = element.tagName ? element.tagName.toLowerCase() : 'text';
        const ignoreTags = ['script', 'style', 'noscript', 'iframe'];
        if (ignoreTags.includes(tagName)) return;

        if (element.nodeType === 3) { // Text node
            const text = sanitizeText(element.textContent || '');
            if (text.length > 0) {
                textNodes.push({
                    text,
                    tag: parentTag,
                    element: element.parentElement
                });
            }
        } else if (element.nodeType === 1) { // Element node
            if (tagName === 'title') {
                const text = sanitizeText(element.textContent || '');
                if (text.length > 0) {
                    textNodes.push({
                        text,
                        tag: 'title',
                        element: element
                    });
                }
                return;
            } else if (tagName === 'meta') {
                const content = element.getAttribute('content');
                if (content) {
                    const text = sanitizeText(content);
                    if (text.length > 0) {
                        textNodes.push({
                            text,
                            tag: 'meta',
                            element: element
                        });
                    }
                }
                return;
            }
            
            for (const child of element.childNodes) {
                collectTextNodes(child, tagName, depth + 1);
            }
        }
    };

    if (document.head && document.body) {
        collectTextNodes(document.head);
        collectTextNodes(document.body);
    } else if (document.body) {
        collectTextNodes(document.body);
    } else if (document.head) {
        collectTextNodes(document.head);
    } else if (document.documentElement) {
        collectTextNodes(document.documentElement);
    }

    const allText = textNodes.map(n => n.text).join(' ');
    const words = allText.split(' ').filter(w => w.length > 0);
    const normalizedKeyword = sanitizeText(targetKeyword);
    
    const keywordPositions = [];
    for (let i = 0; i < words.length; i++) {
        if (words[i] === normalizedKeyword) {
            keywordPositions.push(i);
        }
    }

    if (keywordPositions.length === 0) {
        return {
            chunks: [],
            leaves: [],
            root: '0x0',
            occurrences: 0
        };
    }

    const chunks = [];
    let occurrences = 0;

    for (let i = 0; i < keywordPositions.length; i++) {
        const keywordPos = keywordPositions[i];
        const nextKeywordPos = i < keywordPositions.length - 1 ? keywordPositions[i + 1] : words.length;
        const keywordContent = normalizedKeyword;
        const keywordHash = hashToField(keywordContent);
        let currentTextIndex = 0;
        let foundTag = 'default';
        let foundWeight = TAG_WEIGHTS['default'];
        
        for (const textNode of textNodes) {
            const nodeWords = textNode.text.split(' ').filter(w => w.length > 0);
            const nodeStart = currentTextIndex;
            const nodeEnd = currentTextIndex + nodeWords.length;
            
            if (keywordPos >= nodeStart && keywordPos < nodeEnd) {
                foundTag = textNode.tag;
                foundWeight = getTagWeight(textNode.tag);
                break;
            }
            currentTextIndex = nodeEnd;
        }
        
        chunks.push({
            type: 'keyword',
            hash: keywordHash,
            content: keywordContent,
            position: keywordPos,
            tag: foundTag,
            weight: foundWeight
        });
        occurrences++;

        if (keywordPos + 1 < nextKeywordPos) {
            const contentWords = words.slice(keywordPos + 1, nextKeywordPos);
            const contentText = contentWords.join(' ');
            
            if (contentText.length > 0) {
                const contentHash = hashToField(contentText);
                chunks.push({
                    type: 'chunk',
                    hash: contentHash,
                    content: contentText,
                    position: keywordPos + 1
                });
            }
        }
    }

    const leafHashes = chunks.map(c => c.hash);
    
    let root;
    try {
        root = await buildMerkleRoot(leafHashes);
    } catch (error) {
        console.error('Failed to build merkle root:', error.message);
        throw new Error(`Merkle root calculation failed: ${error.message}`);
    }
    
    let weightedScore = 0;
    for (const chunk of chunks) {
        if (chunk.type === 'keyword') {
            weightedScore += chunk.weight || TAG_WEIGHTS['default'];
        }
    }
    
    const leafCount = chunks.length;
    const internalNodes = leafCount > 1 ? leafCount - 1 : 0;
    const totalNodes = leafCount + internalNodes;
    return {
        chunks,
        leaves: leafHashes,
        root,
        occurrences,
        weightedScore,
        totalNodes,
        leafCount,
        internalNodes
    };
}