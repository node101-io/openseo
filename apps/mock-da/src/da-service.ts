import type { WebSocket } from 'ws';
import type { DABroadcastData } from '@openseo/types';

export interface DASubmission extends DABroadcastData {
    timestamp: number;
}

export interface DABroadcastResult {
    success: boolean;
    message: string;
    error?: string;
}

export class DAService {
    private serviceName: string;
    private submissionsByRoot: Map<string, DASubmission> = new Map();
    private clients: Set<WebSocket> = new Set();

    constructor(serviceName: string = 'DA') {
        this.serviceName = serviceName;
    }


    addClient(ws: WebSocket): void {
        this.clients.add(ws);
        console.log(`[${this.serviceName}] Client connected (${this.clients.size} total)`);
    }

    removeClient(ws: WebSocket): void {
        this.clients.delete(ws);
        console.log(`[${this.serviceName}] Client disconnected (${this.clients.size} total)`);
    }

    async submitProof(submission: Omit<DASubmission, 'timestamp'>): Promise<DABroadcastResult> {
        if (!submission.proof || !submission.root || !submission.keywords || !submission.siteUrl) {
            return {
                success: false,
                message: 'Missing required fields',
                error: 'proof, root, keywords, and siteUrl are required'
            };
        }

        const fullSubmission: DASubmission = {
            ...submission,
            timestamp: Date.now()
        };

        this.submissionsByRoot.set(submission.root, fullSubmission);

        const payload = JSON.stringify({
            type: 'da_broadcast',
            data: {
                root: submission.root,
                keywords: submission.keywords,
                siteUrl: submission.siteUrl,
                proof: submission.proof,
                totalScore: submission.totalScore
            }
        });

        let sent = 0;
        this.clients.forEach((ws) => {
            if (ws.readyState === 1) {
                ws.send(payload);
                sent++;
            }
        });

        console.log(`[${this.serviceName}] Broadcast to ${sent} client(s)`);
        return {
            success: true,
            message: 'Proof broadcast; indexers that are connected will receive it.'
        };
    }

    getSubmissionByRoot(root: string): DASubmission | undefined {
        const normalizeRoot = (r: string) => r.toLowerCase().replace(/^0x/, '');
        const normalized = normalizeRoot(root);

        for (const [storedRoot, submission] of this.submissionsByRoot) {
            if (normalizeRoot(storedRoot) === normalized) {
                return submission;
            }
        }
        return undefined;
    }

    getAllSubmissions(): DASubmission[] {
        return Array.from(this.submissionsByRoot.values());
    }
}

export const DaService = new DAService();
