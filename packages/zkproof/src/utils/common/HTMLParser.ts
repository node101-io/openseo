import { JSDOM } from 'jsdom';
import { sanitizeText, getTagWeight } from './textUtils.js';
import type { LinearizedWord, ParsedHTML } from '@openseo/types';

export type { LinearizedWord, ParsedHTML } from '@openseo/types';

const IGNORE_TAGS = ['script', 'style', 'noscript', 'iframe'];

export namespace HTMLParser {
    export function parse(htmlContent: string): ParsedHTML {
        const dom = new JSDOM(htmlContent);
        const { document } = dom.window;
        const words: LinearizedWord[] = [];
        let position = 0;

        const processTextContent = (text: string, tag: string): void => {
            const sanitized = sanitizeText(text);
            if (!sanitized) return;
            
            const weight = getTagWeight(tag);
            const wordList = sanitized.split(' ').filter(w => w.length > 0);
            
            for (const word of wordList) {
                words.push({
                    word,
                    weight,
                    tag,
                    position: position++
                });
            }
        };

        const processNode = (node: Node, parentTag: string): void => {
            if (node.nodeType === 3) { // TEXT_NODE
                processTextContent(node.textContent || '', parentTag);
            }

            if (node.nodeType !== 1) return; // Not ELEMENT_NODE
            
            const element = node as Element;
            const tagName = element.tagName?.toLowerCase() || '';
            
            if (IGNORE_TAGS.includes(tagName)) return;

            if (tagName === 'title') {
                processTextContent(element.textContent || '', 'title');
            }

            if (tagName === 'meta') {
                const content = element.getAttribute('content');
                if (content) {
                    processTextContent(content, 'meta');
                }
            }

            // Process children with current tag context
            for (const child of element.childNodes) {
                processNode(child, tagName || parentTag);
            }
        };

        // Process document
        if (document.head) processNode(document.head, 'head');
        if (document.body) processNode(document.body, 'body');

        return {
            words,
            totalWords: words.length
        };
    }

    export function findKeywordOccurrences(
        parsed: ParsedHTML,
        keywords: string[]
    ): Map<string, { occurrences: number; weights: number[] }> {
        const normalizedKeywords = new Set(keywords.map(k => sanitizeText(k)));
        const result = new Map<string, { occurrences: number; weights: number[] }>();

        for (const kw of normalizedKeywords) {
            result.set(kw, { occurrences: 0, weights: [] });
        }

        for (const word of parsed.words) {
            if (normalizedKeywords.has(word.word)) {
                const data = result.get(word.word)!;
                data.occurrences++;
                data.weights.push(word.weight);
            }
        }

        return result;
    }
    
    export function calculateKeywordScore(weights: number[]): number {
        return weights.reduce((sum, w) => sum + w, 0);
    }
}

