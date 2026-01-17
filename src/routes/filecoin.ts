import express, {Request, Response} from 'express';
import path from 'path';
import fs from 'fs';
import { storeFile, getFileByCID } from '../services/filecoin.js';

const router = express.Router();

const app = express();
app.use(express.json());
app.use(router);

const PORT = 3000; 

app.post('/send_file', async (req: Request, res: Response) => {
    try {
        const { file } = req.body;
        
        if (!file || typeof file !== 'string') {
            return res.status(400).json({ 
                error: 'file is required and must be a string' 
            });
        }
        
        //create temporary file from content
        const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp');
        if (!fs.existsSync(TEMP_DIR)) {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        }
        
        const tempFilePath = path.join(TEMP_DIR, `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.html`);
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

app.get('/html_file/:cid', async (req: Request, res: Response) => {
    try {
        const { cid } = req.params;
        
        if (!cid) {
            return res.status(400).json({
                error: 'cid is required'
            });
        }
        
        const fileData = getFileByCID(cid);

        if (!fileData) {
            return res.status(404).json({
                error: 'File not found'
            });
        }

        return res.status(200).json({
            success: true,
            cid: fileData.cid,
            file: fileData.file,
            uploadedTime: fileData.uploadedTime,
        });
    } catch (error: any) {
        console.error('Error in /html_file:', error);
        return res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});