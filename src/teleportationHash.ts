import crypto from 'crypto';

export const TAG_WEIGHTS: Record<string, number> = {
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

export function sanitizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(NON_ALLOWED_CHAR_REGEX, ' ')
        .replace(WHITESPACE_REGEX, ' ')
        .trim();
}

export function getTagWeight(tagName: string): number {
    const tag = tagName.toLowerCase();
    return TAG_WEIGHTS[tag] || TAG_WEIGHTS['default'];
}

export function hashToField(text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return '0x' + hash;
}

export function hashKeyword(keyword: string): string {
    const normalized = sanitizeText(keyword);
    return hashToField(normalized);
}


