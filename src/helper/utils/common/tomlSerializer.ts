import { hashToNoirField } from './hashUtils.js';

export interface CircuitInputs {
    keywordCount: number;
    isKeyword: number[];
    wordHashes: string[];
    wordCount: number;
    htmlRoot: string;
}

export function serializeToProverToml(inputs: CircuitInputs, metadata?: { keywords?: string[] }): string {
    const lines: string[] = [];

    lines.push('# ZK-SEO Circuit Proof Input');
    if (metadata?.keywords) {
        lines.push(`# Keywords: ${metadata.keywords.join(', ')}`);
    }
    lines.push(`# HTML Root: ${inputs.htmlRoot}`);
    lines.push(`# Word Count: ${inputs.wordCount}`);
    lines.push(`# Keyword Count: ${inputs.keywordCount}`);
    lines.push('');
    lines.push(`keyword_count = ${inputs.keywordCount}`);
    lines.push(`is_keyword = [${inputs.isKeyword.join(', ')}]`);
    lines.push(`word_hashes = [${inputs.wordHashes.map(h => `"${h}"`).join(', ')}]`);
    lines.push(`word_count = ${inputs.wordCount}`);
    lines.push(`html_root = "${hashToNoirField(inputs.htmlRoot)}"`);

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
        const regex = new RegExp(`^${key} = \\[(.*)\\]`, 'm');
        const match = content.match(regex);
        if (!match) return [];
        return match[1]
            .split(',')
            .map(s => parseInt(s.trim()))
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
        keywordCount: parseNumber('keyword_count'),
        isKeyword: parseIntArray('is_keyword'),
        wordHashes: parseStringArray('word_hashes'),
        wordCount: parseNumber('word_count'),
        htmlRoot: parseString('html_root')
    };
}
