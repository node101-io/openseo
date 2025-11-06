import { JSDOM } from 'jsdom';
import crypto from 'crypto';

export const TAG_WEIGHTS = {
    'title': 10,
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

export function sanitizeText(text) {
    return text
        .toLowerCase()
        .replace(NON_ALLOWED_CHAR_REGEX, ' ')
        .replace(WHITESPACE_REGEX, ' ')
        .trim();
}

//get score by tag
export function getTagWeight(tagName) {
    const tag = tagName.toLowerCase();
    return TAG_WEIGHTS[tag] || TAG_WEIGHTS['default'];
}

//string to hash
export function hashToField(text) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return '0x' + hash;
}

export function hashKeyword(keyword) {
    const normalized = sanitizeText(keyword);
    return hashToField(normalized);
}

//create merkle tree by html dom 
export class MerkleNode {
    constructor(tagName, content, attributes = {}) {
        this.tagName = tagName;
        this.content = content; 
        this.attributes = attributes;
        this.children = [];
        this.parent = null;
        this.hash = null;
        this.contentHash = null; //keyword matching 
        this.weight = getTagWeight(tagName);
        this.keywords = new Map(); //positions??
    }

    //find html tag children and add to children array
    addChild(child) {
        this.children.push(child);
        child.parent = this;
    }

    computeContentHash() {
        if (this.content && this.content.length > 0) {
            this.contentHash = hashToField(this.content);
        }
        return this.contentHash;
    }

    //hash node
    computeHash() {
        const hashInput = {
            tag: this.tagName,
            content: this.content,
            attributes: this.attributes,
            childHashes: this.children.map(c => c.hash)
        };
        
        const hashString = JSON.stringify(hashInput);
        this.hash = crypto.createHash('sha256').update(hashString).digest('hex');
        return this.hash;
    }

    findKeywords() {
        if (!this.content) return;

        const words = this.content.split(' ');
        words.forEach((word, index) => {
            if (word.length > 0) {
                if (!this.keywords.has(word)) {
                    this.keywords.set(word, []);
                }
                this.keywords.get(word).push(index);
            }
        });
    }

    toJSON() {
        return {
            tag: this.tagName,
            content: this.content.substring(0, 100) + (this.content.length > 100 ? '...' : ''),
            hash: this.hash,
            weight: this.weight,
            keywords: Array.from(this.keywords.keys()),
            childCount: this.children.length
        };
    }
}

export class MerkleTree {
    constructor() {
        this.root = null;
        this.allNodes = [];
        this.keywordIndex = new Map(); // keyword -> [{node, positions}]
    }

    //html dom to merkle tree
    buildFromDOM(element, parentNode = null) {
        const tagName = element.tagName ? element.tagName.toLowerCase() : 'text';
        
        if (element.nodeType === 3) { // text
            const text = sanitizeText(element.textContent || '');
            if (text.length === 0) return null;
            
            const node = new MerkleNode('text', text);
            this.allNodes.push(node);
            return node;
        }

        if (element.nodeType === 1) { // element
            const ignoreTags = ['script', 'style', 'noscript', 'iframe'];
            if (ignoreTags.includes(tagName)) {
                return null;
            }

            const attributes = {};
            if (element.attributes) {
                for (const attr of element.attributes) {
                    attributes[attr.name] = attr.value;
                }
            }

            //çıktıda üretilen tree yapısıyla karşılaştırarak anlat daha anlaşılır
            let content = '';
            if (tagName === 'meta') {
                content = sanitizeText(element.getAttribute('content') || '');
            } else if (tagName === 'title') {
                content = sanitizeText(element.textContent || '');
            } else {
                for (const child of element.childNodes) {
                    if (child.nodeType === 3) { //text
                        content += ' ' + (child.textContent || '');
                    }
                }
                content = sanitizeText(content);
            }

            const node = new MerkleNode(tagName, content, attributes);
            this.allNodes.push(node);

            for (const child of element.childNodes) {
                const childNode = this.buildFromDOM(child, node);
                if (childNode) {
                    node.addChild(childNode);
                }
            }
            return node;
        }
        return null;
    }

    //hash all tree
    computeHashes() {
        const computeRecursive = (node) => {
            for (const child of node.children) {
                computeRecursive(child);
            }
            //content hash
            node.computeContentHash();
            //node hash
            node.computeHash();
        };

        if (this.root) {
            computeRecursive(this.root);
        }
    }

    //create witness array for keyword
    buildWitnessArray(keyword) {
        const keywordHash = hashKeyword(keyword);
        const witnessArray = [];
        const matchingNodes = [];

        //find keyword
        for (const node of this.allNodes) {
        if (node.keywords.has(keyword)) {
                if (node.contentHash) {
                    witnessArray.push(keywordHash);
                    matchingNodes.push({
                        node,
                        contentHash: node.contentHash,
                        tag: node.tagName,
                        weight: node.weight
                    });
                }
            }
        }

        return {
            keywordHash,
            witnessArray,
            matchingNodes,
            witnessCount: witnessArray.length
        };
    }

    indexKeywords() {
        for (const node of this.allNodes) {
            node.findKeywords();

            // Keyword index'ini güncelle
            for (const [keyword, positions] of node.keywords.entries()) {
                if (!this.keywordIndex.has(keyword)) {
                    this.keywordIndex.set(keyword, []);
                }
                this.keywordIndex.get(keyword).push({
                    node,
                    positions,
                    tag: node.tagName,
                    weight: node.weight,
                    hash: node.hash
                });
            }
        }
    }
    
    //get zk score by keyword
    getKeywordScore(keyword) {
        const entries = this.keywordIndex.get(keyword) || [];
        let totalScore = 0;

        for (const entry of entries) {
            totalScore += entry.weight * entry.positions.length;
        }

        return totalScore;
    }

    getKeywordDetails(keyword) {
        const entries = this.keywordIndex.get(keyword) || [];
        
        return {
            keyword,
            totalOccurrences: entries.reduce((sum, e) => sum + e.positions.length, 0),
            weightedScore: this.getKeywordScore(keyword),
            locations: entries.map(e => ({
                tag: e.tag,
                weight: e.weight,
                count: e.positions.length,
                score: e.weight * e.positions.length,
                hash: e.hash,
                contentPreview: e.node.content.substring(0, 50)
            }))
        };
    }

    getStats() {
        return {
            totalNodes: this.allNodes.length,
            totalKeywords: this.keywordIndex.size,
            rootHash: this.root ? this.root.hash : null,
            tagDistribution: this.getTagDistribution()
        };
    }

    getTagDistribution() {
        const distribution = {};
        for (const node of this.allNodes) {
            const tag = node.tagName;
            distribution[tag] = (distribution[tag] || 0) + 1;
        }
        return distribution;
    }

    //tree to json
    toJSON() {
        const exportNode = (node) => {
            return {
                ...node.toJSON(),
                children: node.children.map(exportNode)
            };
        };

        return {
            root: this.root ? exportNode(this.root) : null,
            stats: this.getStats()
        };
    }
}

export function parseHTMLToMerkleTree(htmlContent) {
    const dom = new JSDOM(htmlContent);
    const { document } = dom.window;
    const tree = new MerkleTree();
    const htmlElement = document.documentElement;
    tree.root = tree.buildFromDOM(htmlElement);
    tree.computeHashes();
    tree.indexKeywords();

    return tree;
}

