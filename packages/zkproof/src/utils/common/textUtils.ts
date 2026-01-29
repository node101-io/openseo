export const TAG_IDS: Record<string, number> = {
    'default': 0,
    'title': 1,
    'h1': 2,
    'h2': 3,
    'h3': 4,
    'h4': 5,
    'h5': 6,
    'h6': 7,
    'meta': 8,
    'strong': 9,
    'b': 10,
    'i': 11,
    'a': 12,
    'p': 13,
    'span': 14,
    'div': 15,
    'li': 16,
    'td': 17,
    'th': 18,
    'blockquote': 19,
    'code': 20
};

// Tag weights 
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

export function getTagId(tagName: string): number {
    const tag = tagName.toLowerCase();
    return TAG_IDS[tag] ?? TAG_IDS['default'];
}

export function getWeightFromTagId(tagId: number): number {
    const w: Record<number, number> = {
        1: 12, 2: 10, 3: 8, 4: 6, 5: 5, 6: 4, 7: 3, 8: 7, 9: 5, 10: 5,
        11: 4, 12: 6, 13: 3, 14: 2, 15: 2, 16: 3, 17: 2, 18: 4, 19: 3, 20: 3
    };
    return w[tagId] ?? 1;
}