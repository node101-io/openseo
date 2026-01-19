import express, { Request, Response } from 'express';
import { IndexerService } from '../services/indexerService.js';
import { ZkProofMetadata } from '../storage/models/ZkProofMetadata.js';
const { ProofVerifier } = await import('../zk/utils/verifier/ProofVerifier.js');
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

app.get('/search', async (req: Request, res: Response) => {
    try {
        const { query } = req.query;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Query parameter is required'
            });
        }

        console.log(`[Indexer] Search request: "${query}"`);

        const records = await indexerService.searchByKeywords(query);

        return res.status(200).json({
            success: true,
            query: query.trim(),
            count: records.length,
            results: records.map((r, index) => ({
                rank: index + 1,
                id: r._id,
                cid: r.cid,
                root: r.root,
                siteUrl: r.siteUrl,
                keywords: r.keywords,
                totalScore: r.totalScore,
                proof: r.proof,
                verified: r.verified,
                createdAt: r.createdAt
            }))
        });

    } catch (error: any) {
        console.error('[Indexer] Search error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/verify-proof', async (req: Request, res: Response) => {
    try {
        const { proof, root } = req.body;

        if (!proof || !root) {
            return res.status(400).json({
                success: false,
                error: 'Both proof and root are required'
            });
        }

        console.log(`[Indexer] Verify-proof request for root: ${root.substring(0, 20)}...`);
        const verificationResult = await ProofVerifier.verifyProof(proof, root);

        return res.status(200).json({
            success: true,
            verified: verificationResult.isValid,
            verifyTime: verificationResult.verifyTime,
            totalTime: verificationResult.totalTime,
            error: verificationResult.error,
            message: verificationResult.isValid
                ? 'Proof verification successful'
                : `Proof verification failed: ${verificationResult.error}`
        });

    } catch (error: any) {
        console.error('[Indexer] Verify-proof error:', error);
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
        ws.on('message', async (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`[Indexer] Received WebSocket message type: ${message.type}`);

                if (message.type === 'da_broadcast') {
                    const { requestId, data: broadcastData } = message;
                    const result = await indexerService.handleDABroadcast({
                        root: broadcastData.root,
                        keywords: broadcastData.keywords,
                        siteUrl: broadcastData.siteUrl,
                        proof: broadcastData.proof,
                        totalScore: broadcastData.totalScore
                    });

                    const response = JSON.stringify({
                        requestId,
                        success: result.success,
                        message: result.message,
                        record: result.record ? {
                            id: result.record._id,
                            cid: result.record.cid,
                            root: result.record.root,
                            siteUrl: result.record.siteUrl,
                            keywords: result.record.keywords,
                            verified: result.record.verified
                        } : undefined,
                        error: result.error
                    });

                    ws.send(response);                }
            } catch (error: any) {
                console.error('[Indexer] Error processing WebSocket message:', error.message);
                const message = JSON.parse(data.toString());
                if (message.requestId) {
                    ws.send(JSON.stringify({
                        requestId: message.requestId,
                        success: false,
                        error: error.message
                    }));
                }
            }
        });

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