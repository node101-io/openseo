import WebSocket from 'ws';

export interface DASubmission {
    proof: string;
    root: string;
    keywords: string[];
    siteUrl: string;
    totalScore?: number;
    timestamp: number;
}

export interface DABroadcastResult {
    success: boolean;
    message: string;
    indexerResponse?: any;
    error?: string;
}

export class DAService {
    private serviceName: string;
    private indexerWsUrl: string;
    private submissionsByRoot: Map<string, DASubmission> = new Map();
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private reconnectInterval: number = 5000;
    private pendingRequests: Map<string, {
        resolve: (result: DABroadcastResult) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();

    constructor(serviceName: string = 'MockDA', indexerWsUrl?: string) {
        this.serviceName = serviceName;
        this.indexerWsUrl = indexerWsUrl || process.env.INDEXER_WS_URL || 'ws://localhost:3009';
    }

    setIndexerWsUrl(url: string): void {
        this.indexerWsUrl = url;
    }

    async connect(): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
                resolve(true);
                return;
            }

            console.log(`[${this.serviceName}] Connecting to Indexer WebSocket: ${this.indexerWsUrl}`);
            
            this.ws = new WebSocket(this.indexerWsUrl);

            this.ws.on('open', () => {
                console.log(`[${this.serviceName}] Connected to Indexer WebSocket`);
                this.isConnected = true;
                resolve(true);
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                this.handleMessage(data);
            });

            this.ws.on('close', () => {
                console.log(`[${this.serviceName}] WebSocket connection closed`);
                this.isConnected = false;
                this.scheduleReconnect();
            });

            this.ws.on('error', (error) => {
                console.error(`[${this.serviceName}] WebSocket error:`, error.message);
                this.isConnected = false;
                resolve(false);
            });

            // Timeout for initial connection
            setTimeout(() => {
                if (!this.isConnected) {
                    resolve(false);
                }
            }, 10000);
        });
    }

    private scheduleReconnect(): void {
        setTimeout(() => {
            if (!this.isConnected) {
                console.log(`[${this.serviceName}] Attempting to reconnect...`);
                this.connect();
            }
        }, this.reconnectInterval);
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const message = JSON.parse(data.toString());
            const { requestId, success, message: msg, record, error } = message;

            if (requestId && this.pendingRequests.has(requestId)) {
                const pending = this.pendingRequests.get(requestId)!;
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(requestId);

                pending.resolve({
                    success,
                    message: msg,
                    indexerResponse: record ? { record } : undefined,
                    error
                });
            }
        } catch (error) {
            console.error(`[${this.serviceName}] Failed to parse message:`, error);
        }
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
        return await this.broadcastToIndexer(fullSubmission);
    }

    private async broadcastToIndexer(submission: DASubmission): Promise<DABroadcastResult> {
        // Ensure connection
        if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) {
            const connected = await this.connect();
            if (!connected) {
                return {
                    success: false,
                    message: 'Connection failed',
                    error: 'Could not connect to Indexer WebSocket'
                };
            }
        }

        return new Promise((resolve) => {
            const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Set timeout for response
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                resolve({
                    success: false,
                    message: 'Timeout',
                    error: 'Indexer did not respond in time'
                });
            }, 30000);

            this.pendingRequests.set(requestId, { resolve, timeout });

            const message = JSON.stringify({
                type: 'da_broadcast',
                requestId,
                data: {
                    root: submission.root,
                    keywords: submission.keywords,
                    siteUrl: submission.siteUrl,
                    proof: submission.proof,
                    totalScore: submission.totalScore
                }
            });

            this.ws!.send(message, (error) => {
                if (error) {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    resolve({
                        success: false,
                        message: 'Send failed',
                        error: error.message
                    });
                } else {
                    console.log(`[${this.serviceName}] Broadcasted to Indexer via WebSocket`);
                }
            });
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
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

export const mockDAService = new DAService();
