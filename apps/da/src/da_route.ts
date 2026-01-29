import express, { Request, Response } from 'express';
import { DaService } from './da_service';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.DA_PORT;
app.use(express.json({ limit: '50mb' }));

const INDEXER_WS_URL = process.env.INDEXER_WS_URL || 'ws://localhost:3009';
DaService.setIndexerWsUrl(INDEXER_WS_URL);

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
            message: result.message,
            indexerResponse: result.indexerResponse
        });
    } else {
        return res.status(400).json({
            success: false,
            error: result.error,
            indexerResponse: result.indexerResponse
        });
    }
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
    console.log(`[DA Layer] Running on port ${PORT}`);
});

export default app;