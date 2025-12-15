import { JSDOM } from 'jsdom';
import { sanitizeText, getTagWeight } from '../common/textUtils.js';
import { WordOccurrenceData } from '../common/ProverTypes.js';

export namespace HTMLAnalyzer {
    export function analyzeHTML(htmlContent: string, targetKeywords: string[]): Map<string, WordOccurrenceData> {
        const dom = new JSDOM(htmlContent);
        const { document } = dom.window;
        const result = new Map<string, WordOccurrenceData>();        
        const textNodes = extractTextNodes(document);        
        const wordIndex = buildWordIndex(textNodes);
        for (const keyword of targetKeywords) {
            const normalized = sanitizeText(keyword);
            if (!normalized) continue;
            const occurrenceData = findOccurrences(normalized, wordIndex);
            if (occurrenceData.occurrences > 0) {
                result.set(normalized, occurrenceData);
            }
        }
        return result;
    }

    export function getTextNodes(htmlContent: string): Array<{ text: string; tag: string; element: any | null }> {
        const dom = new JSDOM(htmlContent);
        const { document } = dom.window;
        return extractTextNodes(document);
    }

    function extractTextNodes(document: InstanceType<typeof JSDOM>['window']['document']): Array<{ text: string; tag: string; element: any | null }> {
        const textNodes: Array<{ text: string; tag: string; element: any | null }> = [];
        const ignoreTags = ['script', 'style', 'noscript', 'iframe'];
        
        const processTextNode = (element: any, parentTag: string): void => {
            const text = sanitizeText(element.textContent || '');
            if (text.length > 0) {
                textNodes.push({
                    text,
                    tag: parentTag,
                    element: element.parentElement
                });
            }
        };

        const processElementNode = (element: any, parentTag: string): void => {
            const tagName = element.tagName?.toLowerCase() || '';
            if (ignoreTags.includes(tagName)) {
                return;
            }
            
            switch (tagName) {
                case 'title': {
                    const text = sanitizeText(element.textContent || '');
                    if (text.length > 0) {
                        textNodes.push({
                            text,
                            tag: 'title',
                            element: element as any
                        });
                    }
                    break;
                }
                
                case 'meta': {
                    const content = element.getAttribute('content');
                    if (content) {
                        const text = sanitizeText(content);
                        if (text.length > 0) {
                            textNodes.push({
                                text,
                                tag: 'meta',
                                element: element as any
                            });
                        }
                    }
                    break;
                }
                
                default: {
                    if (element.childNodes && element.childNodes.length > 0) {
                        for (const child of element.childNodes) {
                            collectTextNodes(child, tagName || parentTag);
                        }
                    }
                    break;
                }
            }
        };

        const processChildNodes = (element: any, parentTag: string): void => {
            if (element.childNodes && element.childNodes.length > 0) {
                for (const child of element.childNodes) {
                    collectTextNodes(child, parentTag);
                }
            }
        };

        const collectTextNodes = (element: any | null, parentTag: string = 'root'): void => {
            const nodeType = element.nodeType;
            switch (nodeType) {
                case 3: // TEXT_NODE
                    processTextNode(element, parentTag);
                    break;
                case 1: // ELEMENT_NODE
                    processElementNode(element, parentTag);
                    break;
                default:
                    processChildNodes(element, parentTag);
                    break;
            }
        };

        if (document.head && document.body) {
            collectTextNodes(document.head);
            collectTextNodes(document.body);
        } else if (document.body) {
            collectTextNodes(document.body);
        } else if (document.head) {
            collectTextNodes(document.head);
        } else if (document.documentElement) {
            collectTextNodes(document.documentElement);
        }

        return textNodes;
    }

    function buildWordIndex(
        textNodes: Array<{ text: string; tag: string; element: any | null }>
    ): Map<number, { word: string; tag: string; weight: number }> {
        const wordIndex = new Map<number, { word: string; tag: string; weight: number }>();
        let position = 0;
        
        for (const textNode of textNodes) {
            const words = textNode.text.split(' ').filter(w => w.length > 0);
            const tag = textNode.tag;
            const weight = getTagWeight(tag);
            
            for (const word of words) {
                wordIndex.set(position, { word, tag, weight });
                position++;
            }
        }
        
        return wordIndex;
    }

    function findOccurrences(
        keyword: string,
        wordIndex: Map<number, { word: string; tag: string; weight: number }>
    ): WordOccurrenceData {
        const weights: number[] = [];
        let occurrences = 0;
        for (const [position, data] of wordIndex.entries()) {
            if (data.word === keyword) {
                occurrences++;
                weights.push(data.weight);
            }
        }
        return {
            word: keyword,
            occurrences,
            weights
        };
    }
}