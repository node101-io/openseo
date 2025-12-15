export namespace ScoreCalculator {
    export interface OccurrenceData {
        word: string;
        occurrences: number;
        weights: number[]; 
    }

    export function calculateScore(occurrenceData: OccurrenceData): number {
        if (occurrenceData.weights.length !== occurrenceData.occurrences) {
            throw new Error(
                `Weight count (${occurrenceData.weights.length}) must match occurrences (${occurrenceData.occurrences})`
            );
        }
        return occurrenceData.weights.reduce((sum, weight) => sum + weight, 0);
    }
}