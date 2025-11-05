import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
    { name: 'keyword', maxCount: 1 } //sonradan artırılır kelimeler parse edilir array e atılır tek tek bakılır sonuç bir döndürülür => 'hello', 'world'
]);

let isProcessing = false;
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/status', (req, res) => {
    res.json({ processing: isProcessing });
});

app.post('/api/upload', uploadFields, (req, res) => {
    if (isProcessing) {
        return res.status(429).json({
            success: false,
            error: 'A proof process is already running. Please wait.'
        });
    }

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

    isProcessing = true;

    const uploadsDir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const tempFilePath = path.join(uploadsDir, `upload-${Date.now()}.html`);

    try {
        fs.writeFileSync(tempFilePath, fileEntry.buffer.toString('utf-8'));
        const summary = proveAllWords(tempFilePath, keywordInput);
        res.json({ success: true, summary });
    } catch (error) {
        console.error('Proof generation error:', error);
        const statusCode = error.message?.includes('not present') || error.message?.includes('Keyword') ? 400 : 500;
        res.status(statusCode).json({ success: false, error: error.message });
    } finally {
        isProcessing = false;
        try {
            fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
            console.warn('Temporary file could not be deleted:', cleanupError.message);
        }
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`ZK-SEO server is running at http://localhost:${PORT}`);
});
