import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { storeFile, getFileByCID } from './filecoin-service.js';
import * as dotenv from 'dotenv';

const APP_ROOT = path.join(__dirname, '..');
const MOCK_FILECOIN_ROOT = path.join(path.dirname(APP_ROOT), 'mock-filecoin');
const UPLOADS_TEMP_DIR = path.join(MOCK_FILECOIN_ROOT, 'uploads', 'temp');

dotenv.config();
const app = express();
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '250mb' }));
const PORT = 3010; 

app.get('/html_file/:cid', async (req: Request, res: Response) => {
    try {
        const { cid } = req.params;
        
        if (!cid) {
            return res.status(400).json({ 
                success: false,
                error: 'CID is required' 
            });
        }
        
        const fileData = getFileByCID(cid);
        
        if (!fileData) {
            return res.status(404).json({ 
                success: false,
                error: `File not found for CID: ${cid}` 
            });
        }
        
        return res.status(200).json({
            success: true,
            cid: fileData.cid,
            file: fileData.file,
            uploadedTime: fileData.uploadedTime
        });
    } catch (error: any) {
        console.error('Error in /html_file/:cid:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message || 'Internal server error' 
        });
    }
});

app.post('/send_file', async (req: Request, res: Response) => {
    try {
        const { file } = req.body;
        if (!file || typeof file !== 'string') {
            return res.status(400).json({ 
                error: 'file is required and must be a string' 
            });
        }
        
        if (!fs.existsSync(UPLOADS_TEMP_DIR)) {
            fs.mkdirSync(UPLOADS_TEMP_DIR, { recursive: true });
        }

        const tempFilePath = path.join(UPLOADS_TEMP_DIR, `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.html`);
        fs.writeFileSync(tempFilePath, file, 'utf-8');
        
        // store file path
        const result = storeFile(tempFilePath);
        return res.status(200).json({
            success: true,
            cid: result.cid,
            message: 'File stored successfully in filecoin'
        });
    } catch (error: any) {
        console.error('Error in /send_file:', error);
        return res.status(400).json({ 
            error: error.message || 'Invalid request' 
        });
    }
});

app.listen(PORT, () => {
    console.log(`[FileCoin] Server running on port ${PORT}`);
});

export default app;