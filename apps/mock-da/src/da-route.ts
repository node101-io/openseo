import express, { Request, Response } from 'express';
import { WebSocketServer } from 'ws';
import { DaService } from './da-service.js';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3009;
const DA_WS_PORT = 3011;
app.use(express.json({ limit: '50mb' }));

app.post('/submit_proof', async (req: Request, res: Response) => {
    const { proof, root, keywords, siteUrl, totalScore } = req.body;

    if (!proof || !root || !keywords || !siteUrl) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await DaService.submitProof({
        proof,
        root,
        keywords,
        siteUrl,
        totalScore
    });

    if (result.success) {
        return res.status(200).json({
            success: true,
            message: result.message
        });
    }
    return res.status(400).json({
        success: false,
        error: result.error
    });
});

app.get('/submissions', (req: Request, res: Response) => {
    const submissions = DaService.getAllSubmissions();
    return res.status(200).json({
        success: true,
        count: submissions.length,
        submissions: submissions.map(s => ({
            proof: s.proof,
            root: s.root,
            siteUrl: s.siteUrl,
            keywords: s.keywords,
            totalScore: s.totalScore,
            timestamp: s.timestamp
        }))
    });
});

app.listen(PORT, () => {
    console.log(`[DA Layer] HTTP on port ${PORT}`);
});

const wss = new WebSocketServer({ port: Number(DA_WS_PORT) });
wss.on('connection', (ws) => {
    DaService.addClient(ws);
    ws.on('close', () => DaService.removeClient(ws));
});
console.log(`[DA Layer] WebSocket broadcast on port ${DA_WS_PORT} (indexers connect here)`);

export default app;
