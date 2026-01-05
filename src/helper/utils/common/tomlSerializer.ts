import { hashToNoirField } from './hashUtils.js';

export interface CircuitInputsV3 {
    keywordCount: number;
    isKeyword: number; //bit i is 1 if word i is keyword, 0 otherwise
    wordHashes: string[];
    wordCount: number;
    htmlRoot: string;
}

export interface CircuitInputsV4 {
    keywordCount: number;
    isKeyword: number; //bit i is 1 if word i is keyword, 0 otherwise
    wordHashes: string[];
    tagIds: number[];
    wordCount: number;
    htmlRoot: string;
    totalScore: number;
}

export function serializeToProverTomlV3(inputs: CircuitInputsV3, metadata?: { keywords?: string[] }): string {
    const lines: string[] = [];
    lines.push('# ZK-SEO Circuit v3');
    if (metadata?.keywords) lines.push(`# Keywords: ${metadata.keywords.join(', ')}`);
    lines.push('');
    lines.push(`keyword_count = ${inputs.keywordCount}`);
    lines.push(`is_keyword = ${inputs.isKeyword}`);
    lines.push(`word_hashes = [${inputs.wordHashes.map(h => `"${h}"`).join(', ')}]`);
    lines.push(`word_count = ${inputs.wordCount}`);
    lines.push(`html_root = "${hashToNoirField(inputs.htmlRoot)}"`);
    return lines.join('\n');
}

export function serializeToProverTomlV4(inputs: CircuitInputsV4, metadata?: { keywords?: string[] }): string {
    const lines: string[] = [];
    lines.push('# ZK-SEO Circuit With Score');
    if (metadata?.keywords) lines.push(`# Keywords: ${metadata.keywords.join(', ')}`);
    lines.push(`# Total Score: ${inputs.totalScore}`);
    lines.push('');
    lines.push(`keyword_count = ${inputs.keywordCount}`);
    lines.push(`is_keyword = ${inputs.isKeyword}`);
    lines.push(`word_hashes = [${inputs.wordHashes.map(h => `"${h}"`).join(', ')}]`);
    lines.push(`tag_ids = [${inputs.tagIds.join(', ')}]`);
    lines.push(`word_count = ${inputs.wordCount}`);
    lines.push(`html_root = "${hashToNoirField(inputs.htmlRoot)}"`);
    lines.push(`total_score = ${inputs.totalScore}`);
    return lines.join('\n');
}

export type CircuitInputs = CircuitInputsV3;
export const serializeToProverToml = serializeToProverTomlV3;
