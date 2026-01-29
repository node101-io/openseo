import { ZkProofMetadata, IZkProofMetadata } from './db/models/ZkProofMetadata.js';
import { mongoService } from './mongo_service.js';
import { ethers } from 'ethers';
import { getOpenSEOABI } from '../../../packages/contract/src/index.js';
import { ProofVerifier } from "../../../packages/zkproof/src/index.js";
import type { DABroadcastData, IndexerResult } from '@openseo/types';

export class IndexerService {
    private provider!: ethers.JsonRpcProvider;
    private contract!: ethers.Contract;
    private processedRoots = new Set<string>();
    private initialized = false;

    private initializeContract(): boolean {
        if (this.initialized) return !!this.contract;
        const rpcUrl = process.env.ETHEREUM_RPC_URL || '';
        const contractAddress = process.env.CONTRACT_ADDRESS;

        if (contractAddress) {
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            this.contract = new ethers.Contract(contractAddress, getOpenSEOABI(), this.provider);
            this.initialized = true;
            return true;
        } else {
            console.warn('Contract address not found');
            return false;
        }
    }

    private normalizeRoot = (r: string) => r.toLowerCase().replace(/^0x/, '');

    async initialize(): Promise<boolean> {
        this.initializeContract();
        const connected = await mongoService.connect();
        return connected;
    }

    async handleDABroadcast(daData: DABroadcastData): Promise<IndexerResult> {
        if (!this.initialized) {
            this.initializeContract();
        }
    
        const daRoot = this.normalizeRoot(daData.root);

        // check root processed
        if (this.processedRoots.has(daRoot)) {
            return {
                success: true,
                message: 'Already processed'
            };
        }
        
        try {
            // search on ethereum for this root
            const ethResult = await this.findRootInEthereum(daData.root);
            if (!ethResult.found) {
                return {
                    success: false,
                    message: 'Root not found in Ethereum',
                    error: 'This root has no matching CID in Ethereum results'
                };
            }
            // verify proof
            const verificationResult = await ProofVerifier.verifyProof(daData.proof, ethResult.root!);
            
            if (!verificationResult.isValid) {
                return {
                    success: false,
                    message: 'Proof verification failed',
                    error: verificationResult.error
                };
            }

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
        cid?: string; 
        root?: string;
    }> {
        if (!this.initialized) {
            this.initializeContract();
        }
        
        // Check if contract is initialized
        if (!this.contract || !this.provider) {
            return { found: false };
        }

        const targetNormalized = this.normalizeRoot(targetRoot);

        try {
            const contractAddress = await this.contract.getAddress();
            // get RequestCompleted events for found cid
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = 0; 

            const events = await this.contract.queryFilter(
                this.contract.filters.RequestCompleted(),
                fromBlock,
                currentBlock
            );

            for (const event of events) {
                if (event instanceof ethers.EventLog && event.args) {
                    const cid = String(event.args[0]);
                    const success = event.args[1];

                    if (success) {
                        const result = await this.contract.results(cid);
                        const resultRoot = result.resultRoot;

                        if (resultRoot && this.normalizeRoot(resultRoot) === targetNormalized) {
                            return {
                                found: true,
                                cid: cid,
                                root: resultRoot
                            };
                        }
                    }
                }
            }
            return { found: false };

        } catch (error: any) {
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
            return {
                success: true,
                message: 'Saved to mongo successfully',
                record: saved
            };

        } catch (error: any) {
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
        return await ZkProofMetadata.find({ keywords: { $in: keywordArray } });
    }

    async searchByKeywords(query: string): Promise<IZkProofMetadata[]> {
        const searchTerms = query
            .toLowerCase()
            .split(/\s+/)
            .filter(term => term.length > 0);

        if (searchTerms.length === 0) {
            return [];
        }

        const results = await ZkProofMetadata.find({
            keywords: {
                $in: searchTerms.map(term => new RegExp(term, 'i'))
            }
        }).sort({ totalScore: -1 }); 

        return results;
    }
}

export const indexerService = new IndexerService();