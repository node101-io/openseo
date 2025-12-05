import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import fs from 'fs';
import { proveAllWords } from './proveAll.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }
});

const uploadFields = upload.fields([
    { name: 'htmlFile', maxCount: 1 },
    { name: 'keyword', maxCount: 1 }
]);

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

    try {
        const htmlContent = fileEntry.buffer.toString('utf-8');
        const baseTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputDirPrefix = `proofs_batch_${baseTimestamp}`;
        
        console.log(`Generating proofs with Teleportation Tree...`);
        const startTime = performance.now();
        
        const summary = await proveAllWords(htmlContent, keywordInput, true, outputDirPrefix);
        const endTime = performance.now();
        const totalTime = endTime - startTime;
        
        res.json({
            success: true,
            summary: summary,
            totalTime: totalTime
        });
    } catch (error) {
        console.error('Proof generation error:', error);
        const statusCode = error.message?.includes('not present') || error.message?.includes('Keyword') ? 400 : 500;
        res.status(statusCode).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`ZK-SEO server is running at http://localhost:${PORT}`);
});