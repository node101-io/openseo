import { ZkProofMetadata, IZkProofMetadata } from '../storage/models/ZkProofMetadata.js';
import { mongoService } from './mongoService.js';
import { ethers } from 'ethers';
import { getOpenSEOABI } from './contractABI.js';
import { ProofVerifier } from '../zk/utils/verifier/ProofVerifier.js';

export interface DABroadcastData {
    root: string;
    keywords: string[];
    siteUrl: string;
    proof: string;
    totalScore?: number;
}

export interface IndexerResult {
    success: boolean;
    message: string;
    record?: IZkProofMetadata;
    error?: string;
}

export class IndexerService {
    private serviceName = 'Indexer'; 
    private provider!: ethers.JsonRpcProvider;
    private contract!: ethers.Contract;
    private processedRoots = new Set<string>();
    private initialized = false;

    constructor() {
        // Lazy initialization - env vars might not be loaded yet
    }

    private initializeContract(): boolean {
        if (this.initialized) return !!this.contract;
        
        const rpcUrl = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
        const contractAddress = process.env.CONTRACT_ADDRESS;

        if (contractAddress) {
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            this.contract = new ethers.Contract(contractAddress, getOpenSEOABI(), this.provider);
            this.initialized = true;
            console.log(`[${this.serviceName}] Contract setup: ${contractAddress}`);
            return true;
        } else {
            console.warn(`[${this.serviceName}] CONTRACT_ADDRESS not found in .env`);
            return false;
        }
    }

    async initialize(): Promise<boolean> {
        // Initialize contract first
        this.initializeContract();
        
        const connected = await mongoService.connect();
        if (connected) {
            console.log(`[${this.serviceName}] Connected to MongoDB`);
        }
        
        // Log contract info
        if (this.contract && this.provider) {
            try {
                const contractAddress = await this.contract.getAddress();
                const blockNumber = await this.provider.getBlockNumber();
                console.log(`[${this.serviceName}] Contract initialized: ${contractAddress}`);
                console.log(`[${this.serviceName}] Current block: ${blockNumber}`);
            } catch (error: any) {
                console.error(`[${this.serviceName}] Contract initialization check failed:`, error.message);
            }
        } else {
            console.warn(`[${this.serviceName}] Contract not initialized!`);
        }
        
        return connected;
    }

    async handleDABroadcast(daData: DABroadcastData): Promise<IndexerResult> {
        // Ensure contract is initialized
        if (!this.initialized) {
            this.initializeContract();
        }
        
        const normalizeRoot = (r: string) => r.toLowerCase().replace(/^0x/, '');
        const daRoot = normalizeRoot(daData.root);

        // check root processed
        if (this.processedRoots.has(daRoot)) {
            console.log(`[${this.serviceName}] Root already processed`);
            return {
                success: true,
                message: 'Already processed'
            };
        }
        
        try {
            // search on eth for this root
            const ethResult = await this.findRootInEthereum(daData.root);
            if (!ethResult.found) {
                console.log(`[${this.serviceName}] Root not found in Ethereum`);
                return {
                    success: false,
                    message: 'Root not found in Ethereum',
                    error: 'This root has no matching CID in Ethereum results'
                };
            }
            // verify proof
            console.log(`[${this.serviceName}] Verifying proof...`);
            const verificationResult = await ProofVerifier.verifyProof(daData.proof, ethResult.root!);
            
            if (!verificationResult.isValid) {
                console.log(`[${this.serviceName}] Proof verification failed: ${verificationResult.error}`);
                return {
                    success: false,
                    message: 'Proof verification failed',
                    error: verificationResult.error
                };
            }

            console.log(`[${this.serviceName}] Proof verified successfully (${verificationResult.verifyTime?.toFixed(2)}ms)`);

            // save to db
            const result = await this.saveToMongoDB({
                cid: ethResult.cid!,
                root: daData.root,
                keywords: daData.keywords,
                siteUrl: daData.siteUrl,
                proof: daData.proof,
                totalScore: daData.totalScore
            });

            if (result.success) {
                this.processedRoots.add(daRoot);
            }

            return result;

        } catch (error: any) {
            console.error(`[${this.serviceName}] Error handling broadcast:`, error.message);
            return {
                success: false,
                message: 'Processing failed',
                error: error.message
            };
        }
    }

    //search on eth root if found return cid and root
    private async findRootInEthereum(targetRoot: string): Promise<{
        found: boolean;
        cid?: string; // if found
        root?: string;
    }> {
        // Ensure contract is initialized
        if (!this.initialized) {
            this.initializeContract();
        }
        
        // Check if contract is initialized
        if (!this.contract || !this.provider) {
            console.error(`[${this.serviceName}] Contract or provider not initialized`);
            return { found: false };
        }

        const normalizeRoot = (r: string) => r.toLowerCase().replace(/^0x/, '');
        const targetNormalized = normalizeRoot(targetRoot);

        try {
            const contractAddress = await this.contract.getAddress();
            console.log(`[${this.serviceName}] Searching Ethereum for root: ${targetRoot.substring(0, 20)}...`);
            console.log(`[${this.serviceName}] Contract address: ${contractAddress}`);
            
            // get RequestCompleted events for found cid
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = 0; // Start from block 0 to catch all events

            console.log(`[${this.serviceName}] Scanning blocks ${fromBlock} to ${currentBlock}`);

            // Try direct query first
            const events = await this.contract.queryFilter(
                this.contract.filters.RequestCompleted(),
                fromBlock,
                currentBlock
            );

            console.log(`[${this.serviceName}] Found ${events.length} RequestCompleted events`);
            
            // Debug: Also try to get all results directly
            if (events.length === 0) {
                console.log(`[${this.serviceName}] No events found, retrying with fresh provider...`);
                
                // Create fresh provider and retry
                const rpcUrl = process.env.ETHEREUM_RPC_URL || 'http://localhost:8545';
                const freshProvider = new ethers.JsonRpcProvider(rpcUrl);
                const freshContract = new ethers.Contract(contractAddress, getOpenSEOABI(), freshProvider);
                
                const retryEvents = await freshContract.queryFilter(
                    freshContract.filters.RequestCompleted(),
                    fromBlock,
                    currentBlock
                );
                
                console.log(`[${this.serviceName}] Retry found ${retryEvents.length} RequestCompleted events`);
                
                if (retryEvents.length > 0) {
                    for (const event of retryEvents) {
                        if (event instanceof ethers.EventLog && event.args) {
                            const cid = String(event.args[0]);
                            const success = event.args[1];

                            if (success) {
                                const result = await freshContract.results(cid);
                                const resultRoot = result.resultRoot;

                                console.log(`[${this.serviceName}] Checking CID ${cid}, root: ${resultRoot}`);

                                if (resultRoot && normalizeRoot(resultRoot) === targetNormalized) {
                                    console.log(`[${this.serviceName}] Found matching root for CID: ${cid}`);
                                    return {
                                        found: true,
                                        cid: cid,
                                        root: resultRoot
                                    };
                                }
                            }
                        }
                    }
                }
            }

            for (const event of events) {
                if (event instanceof ethers.EventLog && event.args) {
                    const cid = String(event.args[0]);
                    const success = event.args[1];

                    console.log(`[${this.serviceName}] Checking event - CID: ${cid}, success: ${success}`);

                    if (success) {
                        const result = await this.contract.results(cid);
                        const resultRoot = result.resultRoot;

                        console.log(`[${this.serviceName}] CID ${cid} has root: ${resultRoot}`);

                        if (resultRoot && normalizeRoot(resultRoot) === targetNormalized) {
                            console.log(`[${this.serviceName}] Found matching root for CID: ${cid}`);
                            return {
                                found: true,
                                cid: cid,
                                root: resultRoot
                            };
                        }
                    }
                }
            }

            console.log(`[${this.serviceName}] Root not found in Ethereum`);
            return { found: false };

        } catch (error: any) {
            console.error(`[${this.serviceName}] Ethereum search error:`, error.message);
            return { found: false };
        }
    }

    //save mongo 
    private async saveToMongoDB(data: {
        cid: string;
        root: string;
        keywords: string[];
        siteUrl: string;
        proof: string;
        totalScore?: number;
    }): Promise<IndexerResult> {
        try {
            const existing = await ZkProofMetadata.findOne({ cid: data.cid });
            if (existing) {
                console.log(`[${this.serviceName}] Proof exists for CID: ${data.cid}`);
                return {
                    success: true,
                    message: 'Proof already exists',
                    record: existing
                };
            }

            const newRecord = new ZkProofMetadata({
                cid: data.cid,
                root: data.root,
                keywords: data.keywords,
                siteUrl: data.siteUrl,
                proof: data.proof,
                totalScore: data.totalScore,
                verified: true
            });

            const saved = await newRecord.save();
            console.log(`[${this.serviceName}] Saved CID=${data.cid}, site=${data.siteUrl}`);

            return {
                success: true,
                message: 'Saved to mongo successfully',
                record: saved
            };

        } catch (error: any) {
            console.error(`[${this.serviceName}] MongoDB error:`, error.message);
            return {
                success: false,
                message: 'Mongo save failed',
                error: error.message
            };
        }
    }

    // by cid/root
    async getProofsBySiteUrl(siteUrl: string): Promise<IZkProofMetadata[]> {
        return await ZkProofMetadata.find({ siteUrl });
    }

    async getProofsByCID(cid: string): Promise<IZkProofMetadata | null> {
        return await ZkProofMetadata.findOne({ cid });
    }

    async getProofsByRoot(root: string): Promise<IZkProofMetadata[]> {
        return await ZkProofMetadata.find({ root });
    }

    async getProofsByKeywords(keywordArray: string[]): Promise<IZkProofMetadata[]> {
        return await ZkProofMetadata.find({ keywordArray });
    }
}

export const indexerService = new IndexerService();
