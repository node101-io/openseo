import express, { Application, Request, Response } from 'express';
import { IndexerService } from './indexer-service.js';
import { ZkProofMetadata } from './db/models/zk-proof-metadata.js';
import { ProofVerifier } from "../../../packages/zkproof/src/index.js";
import WebSocket from 'ws';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();
const app: Application = express();
const PORT = Number(process.env.INDEXER_PORT) || 3008;
const DA_WS_URL: string = process.env.DA_WS_URL || 'wss://openseo-da.openseo.workers.dev/ws';
const DA_HTTP_URL: string = process.env.DA_HTTP_URL || DA_WS_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/ws\/?$/, '');

app.use((req, res, next) => {
  const origin = req.headers.origin;  
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
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
        console.error('[Indexer] Verify proof error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

async function backfillFromDA() {
    try {
        const url = `${DA_HTTP_URL}/submissions`;
        const res = await axios.get(url, { timeout: 15000 });
        if (!res.data?.submissions?.length) {
            console.log('[Indexer] DA backfill: no submissions');
            return;
        }
        const list = res.data.submissions as Array<{ root: string; keywords: string[]; siteUrl: string; proof: string; totalScore?: number }>;
        for (const s of list) {
            if (!s.root || !s.keywords || !s.siteUrl || !s.proof) continue;
            const result = await indexerService.handleDABroadcast({
                root: s.root,
                keywords: s.keywords,
                siteUrl: s.siteUrl,
                proof: s.proof,
                totalScore: s.totalScore
            });
        }
    } catch (err: any) {
        console.error('[Indexer] DA backfill failed:', err.message || err);
    }
}

function connectToDA() {
    const ws = new WebSocket(DA_WS_URL);
    ws.on('open', () => {
        console.log(`[Indexer] Connected to DA (${DA_WS_URL})`);
        backfillFromDA().catch((err) => console.error('[Indexer] Backfill on connect failed:', err?.message || err));
    });
    ws.on('message', async (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'da_broadcast' && message.data) {
                const broadcastData = message.data;
                const result = await indexerService.handleDABroadcast({
                    root: broadcastData.root,
                    keywords: broadcastData.keywords,
                    siteUrl: broadcastData.siteUrl,
                    proof: broadcastData.proof,
                    totalScore: broadcastData.totalScore
                });
                if (result.success) {
                    console.log('[Indexer] Stored proof for', broadcastData.siteUrl);
                } else {
                    console.log('[Indexer] Rejected:', broadcastData.siteUrl, '-', result.message, result.error || '');
                }
            }
        } catch (error: any) {
            console.error('[Indexer] Error processing DA broadcast:', error.message);
        }
    });
    ws.on('close', () => {
        console.log('[Indexer] DA WebSocket closed');
        setTimeout(connectToDA, 5000);
    });
    ws.on('error', (err) => {
        console.error('[Indexer] DA WebSocket error:', err.message);
    });
}

const BACKFILL_INTERVAL_MS = 60 * 1000;

async function startIndexer() {
    await indexerService.initialize();
    app.listen(PORT, () => {
        console.log(`[Indexer] HTTP server running on port ${PORT}`);
        console.log(`[Indexer] Contract: ${process.env.PROGRAM_ID || 'not configured'}`);
    });

    connectToDA();
    await backfillFromDA();
    setInterval(() => backfillFromDA().catch((err) => console.error('[Indexer] Periodic backfill failed:', err?.message || err)), BACKFILL_INTERVAL_MS);
}

startIndexer().catch(console.error);
export default app;