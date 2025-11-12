import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { proveAllWords } from './proveAll.js';
import { MerkleTreeType } from './parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }
});

const uploadFields = upload.fields([
    { name: 'htmlFile', maxCount: 1 },
    { name: 'keyword', maxCount: 1 },
    { name: 'treeType', maxCount: 1 }
]);

let isProcessing = false;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.post('/api/upload', uploadFields, async (req, res) => {
    const fileEntry = req.files?.htmlFile?.[0];
    if (!fileEntry) {
        return res.status(400).json({
            success: false,
            error: 'HTML file not found.'
        });
    }

    const isHtml = fileEntry.mimetype === 'text/html' || fileEntry.originalname.toLowerCase().endsWith('.html');
    if (!isHtml) {
        return res.status(400).json({
            success: false,
            error: 'Please upload an HTML file only.'
        });
    }

    const keywordRaw = Array.isArray(req.body?.keyword) ? req.body.keyword[0] : req.body?.keyword;
    const keywordInput = (keywordRaw ?? '').toString().trim();
    if (!keywordInput) {
        return res.status(400).json({
            success: false,
            error: 'Keyword is required for proof generation.'
        });
    }

    const treeTypeRaw = Array.isArray(req.body?.treeType) ? req.body.treeType[0] : req.body?.treeType;
    const treeType = (treeTypeRaw ?? MerkleTreeType.DOM_DIRECT).toString().trim();
    const validTreeTypes = Object.values(MerkleTreeType);
    if (!validTreeTypes.includes(treeType)) {
        return res.status(400).json({
            success: false,
            error: `Invalid tree type. Valid options: ${validTreeTypes.join(', ')}`
        });
    }

    isProcessing = true;

    try {
        const htmlContent = fileEntry.buffer.toString('utf-8');
        console.log(`Using Merkle Tree Type: ${treeType}`);
        
        const summary = await proveAllWords(htmlContent, keywordInput, true, treeType);
        res.json({ success: true, summary });
    } catch (error) {
        console.error('Proof generation error:', error);
        const statusCode = error.message?.includes('not present') || error.message?.includes('Keyword') ? 400 : 500;
        res.status(statusCode).json({ success: false, error: error.message });
    } finally {
        isProcessing = false;
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`ZK-SEO server is running at http://localhost:${PORT}`);
});