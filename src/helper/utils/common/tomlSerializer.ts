import { hashToNoirField } from './hashUtils.js';

export interface CircuitInputs {
    keywordHashes: string[];
    keywordCount: number;
    htmlRoot: string;
    wordHashes: string[];
    keywordScores: number[];
    isKeyword: number[];
    wordCount: number;
    occurrences: number;
}

export function serializeToProverToml(inputs: CircuitInputs, metadata?: { keywords?: string[] }): string {
    const lines: string[] = [];

    lines.push('# ZK-SEO Circuit Proof Input');
    if (metadata?.keywords) {
        lines.push(`# Keywords: ${metadata.keywords.join(', ')}`);
    }
    lines.push(`# HTML Root: ${inputs.htmlRoot}`);
    lines.push(`# Word Count: ${inputs.wordCount}`);
    lines.push(`# Occurrences: ${inputs.occurrences}`);
    lines.push('');
    lines.push(`keyword_hashes = [${inputs.keywordHashes.map(h => `"${h}"`).join(', ')}]`);
    lines.push(`keyword_count = ${inputs.keywordCount}`);
    lines.push(`html_root = "${hashToNoirField(inputs.htmlRoot)}"`);
    lines.push('');
    lines.push(`word_hashes = [${inputs.wordHashes.map(h => `"${h}"`).join(', ')}]`);
    lines.push('');
    lines.push(`keyword_scores = [${inputs.keywordScores.join(', ')}]`);
    lines.push('');
    lines.push(`is_keyword = [${inputs.isKeyword.join(', ')}]`);
    lines.push('');
    lines.push(`word_count = ${inputs.wordCount}`);
    lines.push(`occurrences = ${inputs.occurrences}`);

    return lines.join('\n');
}

export function parseProverToml(content: string): CircuitInputs {
    const parseStringArray = (key: string): string[] => {
        const regex = new RegExp(`^${key} = \\[(.*)\\]`, 'm');
        const match = content.match(regex);
        if (!match) return [];
        return match[1]
            .split(',')
            .map(s => s.trim().replace(/"/g, ''))
            .filter(h => h.length > 0);
    };

    const parseIntArray = (key: string): number[] => {
        const regex = new RegExp(`^${key} = \\[([\\s\\S]*?)\\]`, 'm');
        const match = content.match(regex);
        if (!match) return [];
        return match[1]
            .split(',')
            .map(s => parseInt(s.trim().replace(/\n/g, '')))
            .filter(v => !isNaN(v));
    };

    const parseNumber = (key: string): number => {
        const regex = new RegExp(`^${key} = (\\d+)`, 'm');
        const match = content.match(regex);
        return match ? parseInt(match[1]) : 0;
    };

    const parseString = (key: string): string => {
        const regex = new RegExp(`^${key} = "(.*?)"`, 'm');
        const match = content.match(regex);
        return match ? match[1] : '';
    };

    return {
        keywordHashes: parseStringArray('keyword_hashes'),
        keywordCount: parseNumber('keyword_count'),
        htmlRoot: parseString('html_root'),
        wordHashes: parseStringArray('word_hashes'),
        keywordScores: parseIntArray('keyword_scores'),
        isKeyword: parseIntArray('is_keyword'),
        wordCount: parseNumber('word_count'),
        occurrences: parseNumber('occurrences')
    };
}

