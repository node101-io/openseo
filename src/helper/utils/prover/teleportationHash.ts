import crypto from 'crypto';
import { Chunk, TeleportationTreeResult } from '../common/ProverTypes.js';
import { HTMLAnalyzer } from './HTMLAnalyzer.js';
import { MerkleTreeBuilder } from '../verifier/MerkleTreeBuilder.js';
import { TAG_WEIGHTS, sanitizeText, getTagWeight } from '../common/textUtils.js';

export function hashToField(text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return '0x' + hash;
}

export function hashKeyword(keyword: string): string {
    const normalized = sanitizeText(keyword);
    return hashToField(normalized);
}

export async function buildTeleportationTree(
    htmlContent: string,
    targetKeywords: string[]
): Promise<TeleportationTreeResult> {
    const textNodes = HTMLAnalyzer.getTextNodes(htmlContent);
    const allText = textNodes.map((n: { text: string; tag: string; element: any | null }) => n.text).join(' ');
    const words = allText.split(' ').filter((w: string) => w.length > 0);
    const normalizedKeywords = targetKeywords.map(kw => sanitizeText(kw));
    
    interface KeywordPosition {
        position: number;
        keywordIndex: number;
        keyword: string;
    }
    
    const keywordPositions: KeywordPosition[] = [];
    for (let i = 0; i < words.length; i++) {
        for (let kwIdx = 0; kwIdx < normalizedKeywords.length; kwIdx++) {
            if (words[i] === normalizedKeywords[kwIdx]) {
                keywordPositions.push({
                    position: i,
                    keywordIndex: kwIdx,
                    keyword: normalizedKeywords[kwIdx]
                });
            }
        }
    }
    keywordPositions.sort((a, b) => a.position - b.position);

    if (keywordPositions.length === 0) {
        return {
            chunks: [],
            leaves: [],
            root: '0x0',
            occurrences: 0,
            weightedScore: 0,
            totalNodes: 0,
            leafCount: 0,
            internalNodes: 0
        };
    }

    const chunks: Chunk[] = [];
    let occurrences = 0;

    for (let i = 0; i < keywordPositions.length; i++) {
        const keywordPos = keywordPositions[i];
        const nextKeywordPos = i < keywordPositions.length - 1 ? keywordPositions[i + 1].position : words.length;
        const keywordContent = keywordPos.keyword;
        const keywordHash = hashToField(keywordContent);
        let currentTextIndex = 0;
        let foundTag = 'default';
        let foundWeight = TAG_WEIGHTS['default'];
        
        for (const textNode of textNodes) {
            const nodeWords = textNode.text.split(' ').filter((w: string) => w.length > 0);
            const nodeStart = currentTextIndex;
            const nodeEnd = currentTextIndex + nodeWords.length;
            
            if (keywordPos.position >= nodeStart && keywordPos.position < nodeEnd) {
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
            position: keywordPos.position,
            tag: foundTag,
            weight: foundWeight,
            keyword: targetKeywords[keywordPos.keywordIndex]
        });
        occurrences++;

        //add chunk between two keywords
        if (keywordPos.position + 1 < nextKeywordPos) {
            const contentWords = words.slice(keywordPos.position + 1, nextKeywordPos);
            const contentText = contentWords.join(' ');
            
            if (contentText.length > 0) {
                const contentHash = hashToField(contentText);
                chunks.push({
                    type: 'chunk',
                    hash: contentHash,
                    content: contentText,
                    position: keywordPos.position + 1
                });
            }
        }
    }

    const leafHashes = chunks.map(c => c.hash);    
    let root: string;
    try {
        root = await MerkleTreeBuilder.buildMerkleRoot(leafHashes);
    } catch (error: any) {
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
