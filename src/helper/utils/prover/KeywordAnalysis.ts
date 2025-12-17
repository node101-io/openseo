import { HTMLAnalyzer } from './HTMLAnalyzer.js';
import { ScoreCalculator } from './ScoreCalculator.js';
import { HashService } from './Hashing.js';
import { Fr } from '@aztec/bb.js';
import { barretenbergApi } from '../common/barretenbergApi.js';
import { formatHashResult, hashToNoirField } from '../common/hashUtils.js';
import { sanitizeText, getTagWeight } from '../common/textUtils.js';
import { MAX_CHUNKS } from '../common/constants.js';
import { WordScorePair, ProverOutput, WordOccurrenceData } from '../common/ProverTypes.js';

async function buildHtmlRoot(
    htmlContent: string,
    targetKeywords: string[]
): Promise<string> {
    const api = await barretenbergApi.getBarretenbergApi();
    let currentRoot = new Fr(BigInt(0));
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
    
    const wordsToProcess = Math.min(wordDataList.length, MAX_CHUNKS);
    let i = 0;
    
    while (i < wordsToProcess) {
        const wordData = wordDataList[i];
        const isKeyword = keywordSet.has(wordData.word);
        
        if (isKeyword) {
            // Keyword: H(current_root, H(word_hash, score))
            const score = wordData.weight;
            const wordHash = HashService.hashWordForCircuit(wordData.word);
            const wordHashValue = barretenbergApi.hexToFieldValue(wordHash);
            const wordHashField = new Fr(wordHashValue);
            const scoreField = new Fr(BigInt(score));
            const wordScoreHash = api.pedersenHash([wordHashField, scoreField], 0);
            currentRoot = api.pedersenHash([currentRoot, wordScoreHash], 0);
            i++;
        } else {
            // Chunk: H(current_root, chunk_hash)
            const chunkWords: string[] = [];
            let chunkIndex = i;
            
            while (chunkIndex < wordsToProcess && 
                   !keywordSet.has(wordDataList[chunkIndex].word)) {
                chunkWords.push(wordDataList[chunkIndex].word);
                chunkIndex++;
            }
            
            const chunkText = chunkWords.join(' ');
            const chunkHash = HashService.hashWordForCircuit(chunkText);
            const chunkHashValue = barretenbergApi.hexToFieldValue(chunkHash);
            const chunkHashField = new Fr(chunkHashValue);
            currentRoot = api.pedersenHash([currentRoot, chunkHashField], 0);
            i = chunkIndex;
        }
    }
    
    const formatted = formatHashResult(currentRoot);
    return hashToNoirField(formatted);
}

export namespace KeywordAnalysis {
    export async function analyzeKeywords(
        htmlContent: string,
        targetKeywords: string[]
    ): Promise<ProverOutput> {
        if (targetKeywords.length === 0) {
            throw new Error('At least one keyword is required');
        }

        if (targetKeywords.length > 16) {
            throw new Error(`Maximum 16 keywords allowed, got ${targetKeywords.length}`);
        }

        const occurrenceDataMap = HTMLAnalyzer.analyzeHTML(htmlContent, targetKeywords);
        const wordScorePairs: WordScorePair[] = [];

        for (const keyword of targetKeywords) {
            const normalized = keyword.toLowerCase().trim();
            const occurrenceData = occurrenceDataMap.get(normalized);

            if (!occurrenceData) {
                throw new Error(`Keyword "${keyword}" not found in HTML`);
            }

            const score = ScoreCalculator.calculateScore(occurrenceData);
            wordScorePairs.push({
                word: normalized,
                score
            });
        }
        const wordHashes = await HashService.hashWordScores(wordScorePairs);
        const htmlRoot = await buildHtmlRoot(htmlContent, targetKeywords);

        return {
            htmlRoot,
            wordScorePairs,
            wordHashes
        };
    }

    export function getOccurrenceData(
        htmlContent: string,
        targetKeywords: string[]
    ): Map<string, WordOccurrenceData> {
        return HTMLAnalyzer.analyzeHTML(htmlContent, targetKeywords);
    }
}