import express, { Request, Response } from 'express';
import { IndexerService } from '../services/indexerService.js';
import { ZkProofMetadata } from '../storage/models/ZkProofMetadata.js';
import { getOpenSEOABI } from '../services/contractABI.js';
import { WebSocketServer, WebSocket } from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.INDEXER_PORT || 3008;
const WS_PORT = process.env.INDEXER_WS_PORT || 3009;

app.use(express.json({ limit: '50mb' }));

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';

const indexerService = new IndexerService();

app.post('/da_broadcast', async (req: Request, res: Response) => {
    try {
        const { root, keywords, siteUrl, proof, totalScore } = req.body;

        if (!root || !keywords || !siteUrl || !proof) {
            return res.status(400).json({
                success: false,
                error: 'root, keywords, siteUrl, and proof are required'
            });
        }

        const result = await indexerService.handleDABroadcast({
            root,
            keywords,
            siteUrl,
            proof,
            totalScore
        });

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: result.message,
                record: result.record ? {
                    id: result.record._id,
                    cid: result.record.cid,
                    root: result.record.root,
                    siteUrl: result.record.siteUrl,
                    keywords: result.record.keywords,
                    verified: result.record.verified
                } : undefined
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error || result.message
            });
        }

    } catch (error: any) {
        console.error('[Indexer] Error in /da_broadcast:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/proof/:cid', async (req: Request, res: Response) => {
    try {
        const { cid } = req.params;
        const record = await indexerService.getProofsByCID(cid);

        if (!record) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }

        return res.status(200).json({
            success: true,
            record: {
                id: record._id,
                cid: record.cid,
                root: record.root,
                siteUrl: record.siteUrl,
                keywords: record.keywords,
                proof: record.proof,
                totalScore: record.totalScore,
                verified: record.verified,
                createdAt: record.createdAt
            }
        });

    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/proofs', async (req: Request, res: Response) => {
    try {
        const { siteUrl, keywords, root } = req.query;

        let records;

        if (root) {
            records = await indexerService.getProofsByRoot(root as string);
        } else if (siteUrl) {
            records = await indexerService.getProofsBySiteUrl(siteUrl as string);
        } else if (keywords) {
            const keywordArray = (keywords as string).split(',').map(k => k.trim());
            records = await indexerService.getProofsByKeywords(keywordArray);
        } else {
            records = await ZkProofMetadata.find().limit(100).sort({ createdAt: -1 });
        }

        return res.status(200).json({
            success: true,
            count: records.length,
            records: records.map((r) => ({
                id: r._id,
                cid: r.cid,
                root: r.root,
                siteUrl: r.siteUrl,
                keywords: r.keywords,
                totalScore: r.totalScore,
                verified: r.verified,
                createdAt: r.createdAt
            }))
        });

    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// start
async function startIndexer() {
    await indexerService.initialize();

    app.listen(PORT, () => {
        console.log(`[Indexer] HTTP server running on port ${PORT}`);
        console.log(`[Indexer] Contract: ${CONTRACT_ADDRESS || 'not configured'}`);
    });

    // WebSocket Server
    const wss = new WebSocketServer({ port: Number(WS_PORT) });
    
    wss.on('connection', (ws: WebSocket) => {
        console.log('[Indexer] New WebSocket connection');

        ws.on('close', () => {
            console.log('[Indexer] WebSocket connection closed');
        });

        ws.on('error', (error) => {
            console.error('[Indexer] WebSocket error:', error);
        });
    });

    console.log(`[Indexer] WebSocket server running on port ${WS_PORT}`);
}

startIndexer().catch(console.error);

export default app;