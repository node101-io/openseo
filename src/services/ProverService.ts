import { HTMLAnalyzerService } from './HTMLAnalyzerService.js';
import { ScoreCalculatorService } from './ScoreCalculatorService.js';
import { WordScoreHashService } from './WordScoreHashService.js';
import { MerkleTreeBuilderService } from './MerkleTreeBuilderService.js';
import { WordScorePair, ProverOutput, WordOccurrenceData } from '../types/ProverTypes.js';

export class ProverService {
    private htmlAnalyzer: HTMLAnalyzerService;
    private scoreCalculator: ScoreCalculatorService;
    private wordScoreHasher: WordScoreHashService;
    private merkleTreeBuilder: MerkleTreeBuilderService;

    constructor() {
        this.htmlAnalyzer = new HTMLAnalyzerService();
        this.scoreCalculator = new ScoreCalculatorService();
        this.wordScoreHasher = new WordScoreHashService();
        this.merkleTreeBuilder = new MerkleTreeBuilderService();
    }

    public async generateProof(
        htmlContent: string,
        targetKeywords: string[]
    ): Promise<ProverOutput> {
        if (targetKeywords.length === 0) {
            throw new Error('At least one keyword is required');
        }

        if (targetKeywords.length > 16) {
            throw new Error(`Maximum 16 keywords allowed, got ${targetKeywords.length}`);
        }

        const occurrenceDataMap = this.htmlAnalyzer.analyzeHTML(htmlContent, targetKeywords);
        const wordScorePairs: WordScorePair[] = [];

        for (const keyword of targetKeywords) {
            const normalized = keyword.toLowerCase().trim();
            const occurrenceData = occurrenceDataMap.get(normalized);

            if (!occurrenceData) {
                throw new Error(`Keyword "${keyword}" not found in HTML`);
            }

            const score = this.scoreCalculator.calculateScore(occurrenceData);
            wordScorePairs.push({
                word: normalized,
                score
            });
        }
        const wordHashes = await this.wordScoreHasher.hashWordScores(wordScorePairs);
        const merkleRoot = await this.merkleTreeBuilder.buildMerkleRoot(wordHashes);

        return {
            merkleRoot,
            wordScorePairs,
            wordHashes
        };
    }

    public getOccurrenceData(
        htmlContent: string,
        targetKeywords: string[]
    ): Map<string, WordOccurrenceData> {
        return this.htmlAnalyzer.analyzeHTML(htmlContent, targetKeywords);
    }
}
