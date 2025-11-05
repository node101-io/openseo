import { JSDOM } from 'jsdom';
import { createHash } from 'crypto';
import fs from 'fs';

const TAG_TYPES = {
    'H1': 1,
    'H2': 2,
    'H3': 3,
    'TITLE': 4,
    'P': 5,
    'DIV': 6,
    'SPAN': 7
};

const TAG_SCORES = {
    1: 10,   // H1
    2: 8,    // H2
    3: 6,    // H3
    4: 12,   // TITLE
    5: 4,    // P
    6: 2,    // DIV
    7: 1     // SPAN
};

const MAX_WORDS_PER_LEAF = 8;
const MAX_LEAVES = 4;

function hashWord(word) {
    const hash = createHash('sha256').update(word.toLowerCase()).digest('hex');
    return BigInt('0x' + hash.substring(0, 15));
}

function getDirectTextContent(element) {
    let text = '';
    for (const node of element.childNodes) {
        if (node.nodeType === 3) { 
            text += node.textContent;
        }
    }
    return text;
}

function extractWords(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 0);
}

function parseHTML(htmlContent) {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    const leaves = [];
    const supportedTags = ['H1', 'H2', 'H3', 'TITLE', 'P', 'DIV', 'SPAN'];
    
    for (const tagName of supportedTags) {
        const elements = document.getElementsByTagName(tagName);
        
        for (const element of elements) {
            const text = getDirectTextContent(element);
            const words = extractWords(text);
            
            if (words.length > 0) {
                const hashedWords = words.slice(0, MAX_WORDS_PER_LEAF).map(hashWord);
                
                leaves.push({
                    tag_type: TAG_TYPES[tagName],
                    tag_name: tagName,
                    words: hashedWords,
                    word_count: hashedWords.length,
                    original_words: words.slice(0, MAX_WORDS_PER_LEAF) 
                });
            }
        }
    }
    
    return leaves.slice(0, MAX_LEAVES);
}
function generateNoirInput(leaves, searchWord) {
    const searchWordHash = hashWord(searchWord);
    
    let expectedScore = 0;
    for (const leaf of leaves) {
        const count = leaf.words.filter(w => w === searchWordHash).length;
        expectedScore += TAG_SCORES[leaf.tag_type] * count;
    }
    
    while (leaves.length < MAX_LEAVES) {
        leaves.push({
            tag_type: 0,
            words: Array(MAX_WORDS_PER_LEAF).fill(0n),
            word_count: 0
        });
    }
    
    let toml = `# ZK-SEO Prover Input\n`;
    toml += `# Aranan kelime: "${searchWord}"\n\n`;
    toml += `searched_word = "${searchWordHash}"\n`;
    toml += `expected_score = ${expectedScore}\n`;
    toml += `leaf_count = "${leaves.filter(l => l.tag_type !== 0).length}"\n\n`;
    
    toml += `[[leaves]]\n`;
    for (let i = 0; i < MAX_LEAVES; i++) {
        const leaf = leaves[i];
        toml += `tag_type = ${leaf.tag_type}\n`;
        toml += `word_count = ${leaf.word_count}\n`;
        
        toml += `words = [`;
        for (let j = 0; j < MAX_WORDS_PER_LEAF; j++) {
            const word = leaf.words[j] || 0n;
            toml += `"${word}"`;
            if (j < MAX_WORDS_PER_LEAF - 1) toml += ', ';
        }
        toml += `]\n\n`;
    }
    
    return { toml, expectedScore, searchWordHash };
}

export function parseHTMLFile(htmlFilePath, searchWord) {
    console.log('🔍 HTML Dosyası Parse Ediliyor...');
    
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
    
    const leaves = parseHTML(htmlContent);
    
    console.log(`✅ ${leaves.length} leaf bulundu`);
    
    console.log('\n📋 Leaf Detayları:');
    for (const leaf of leaves) {
        console.log(`  ${leaf.tag_name}: ${leaf.word_count} kelime`);
        if (leaf.original_words) {
            console.log(`    Kelimeler: ${leaf.original_words.join(', ')}`);
        }
    }
    
    const { toml, expectedScore, searchWordHash } = generateNoirInput(leaves, searchWord);
    
    console.log(`\n🎯 Aranan kelime: "${searchWord}"`);
    console.log(`   Hash: ${searchWordHash}`);
    console.log(`   Beklenen ZK Skor: ${expectedScore}`);
    
    fs.writeFileSync('Prover.toml', toml);
    console.log('\n✅ Prover.toml oluşturuldu!');
    
    return { leaves, expectedScore, searchWordHash };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Kullanım: node src/parser.js <html-dosyasi> <aranan-kelime>');
        console.log('Örnek: node src/parser.js example.html hello');
        process.exit(1);
    }
    
    const [htmlFile, searchWord] = args;
    parseHTMLFile(htmlFile, searchWord);
}

