import { hashToNoirField } from './hashUtils.js';
import type { CircuitInputs } from '@openseo/types';
export type { CircuitInputs } from '@openseo/types';

export function serializeToProverToml(inputs: CircuitInputs, metadata?: { keywords?: string[] }): string {
    const lines: string[] = [];
    lines.push('# ZK-SEO Circuit');
    if (metadata?.keywords) lines.push(`# Keywords: ${metadata.keywords.join(', ')}`);
    lines.push(`# Total Score: ${inputs.totalScore}`);
    lines.push('');
    lines.push(`keyword_count = ${inputs.keywordCount}`);
    lines.push(`is_keyword = ${inputs.isKeyword}`);
    lines.push(`keyword_positions = [${inputs.keywordPositions.join(', ')}]`);
    lines.push(`word_hashes = [${inputs.wordHashes.map(h => `"${h}"`).join(', ')}]`);
    lines.push(`tag_ids = [${inputs.tagIds.join(', ')}]`);
    lines.push(`word_count = ${inputs.wordCount}`);
    lines.push(`html_root = "${hashToNoirField(inputs.htmlRoot)}"`);
    lines.push(`total_score = ${inputs.totalScore}`);
    return lines.join('\n');
}
