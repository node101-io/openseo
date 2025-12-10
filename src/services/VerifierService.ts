import { WordScoreHashService } from './WordScoreHashService.js';
import { MerkleTreeBuilderService } from './MerkleTreeBuilderService.js';
import { VerifierInput } from '../types/ProverTypes.js';

export class VerifierService {
    private wordScoreHasher: WordScoreHashService;
    private merkleTreeBuilder: MerkleTreeBuilderService;

    constructor() {
        this.wordScoreHasher = new WordScoreHashService();
        this.merkleTreeBuilder = new MerkleTreeBuilderService();
    }

    public async verify(verifierInput: VerifierInput): Promise<boolean> {
        const wordHashes = await this.wordScoreHasher.hashWordScores(verifierInput.wordScorePairs);
        const calculatedRoot = await this.merkleTreeBuilder.buildMerkleRoot(wordHashes);
        return calculatedRoot.toLowerCase() === verifierInput.merkleRoot.toLowerCase();
    }

}