import { JSDOM } from 'jsdom';
import { sanitizeText, getTagWeight } from '../teleportationHash.js';
import { WordOccurrenceData } from '../types/ProverTypes.js';

export class HTMLAnalyzerService {
    public analyzeHTML(htmlContent: string, targetKeywords: string[]): Map<string, WordOccurrenceData> {
        const dom = new JSDOM(htmlContent);
        const { document } = dom.window;
        const result = new Map<string, WordOccurrenceData>();        
        const textNodes = this.extractTextNodes(document);        
        const wordIndex = this.buildWordIndex(textNodes);
        for (const keyword of targetKeywords) {
            const normalized = sanitizeText(keyword);
            if (!normalized) continue;
            const occurrenceData = this.findOccurrences(normalized, wordIndex);
            if (occurrenceData.occurrences > 0) {
                result.set(normalized, occurrenceData);
            }
        }
        return result;
    }

    private extractTextNodes(document: ReturnType<JSDOM['window']['document']>): Array<{ text: string; tag: string; element: any | null }> {
        const textNodes: Array<{ text: string; tag: string; element: any | null }> = [];
        const ignoreTags = ['script', 'style', 'noscript', 'iframe'];
        
        const collectTextNodes = (element: any | null, parentTag: string = 'root'): void => {
            if (!element) return;
            
            const tagName = (element as any).tagName 
                ? (element as any).tagName.toLowerCase() 
                : 'text';
            
            if (ignoreTags.includes(tagName)) return;
            if (element.nodeType === 3) { // Text node
                const text = sanitizeText(element.textContent || '');
                if (text.length > 0) {
                    textNodes.push({
                        text,
                        tag: parentTag,
                        element: element.parentElement
                    });
                }
            } else if (element.nodeType === 1) { // Element node
                if (tagName === 'title') {
                    const text = sanitizeText(element.textContent || '');
                    if (text.length > 0) {
                    textNodes.push({
                        text,
                        tag: 'title',
                        element: element as any
                    });
                    }
                    return;
                } else if (tagName === 'meta') {
                    const content = (element as any).getAttribute('content');
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
                    return;
                }
                
                for (const child of element.childNodes) {
                    collectTextNodes(child, tagName);
                }
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

    private buildWordIndex(
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

    private findOccurrences(
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
