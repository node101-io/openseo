import bs58 from "bs58";
import { ZkProofMetadata, IZkProofMetadata } from './db/models/zk-proof-metadata.js';
import { mongoService } from './mongo-service.js';
import { isBlacklisted } from './blacklist.js';
import { Connection, Keypair } from '@solana/web3.js';
import { cidToHash, createProgram, getProgramId } from '@openseo/contracts';
import { ProofVerifier } from '@openseo/zkproof';
import type { DABroadcastData, IndexerResult } from '@openseo/types';

export class IndexerService {
    private connection!: Connection;
    private program!: ReturnType<typeof createProgram>;
    private processedRoots = new Set<string>();
    private initialized = false;

    private initializeContract(): boolean {
        if (this.initialized) return !!this.program;
        const rpcUrl = process.env.SOLANA_RPC_URL || '';

        if (rpcUrl) {
            this.connection = new Connection(rpcUrl);
            const readOnlyKeypair = Keypair.generate();
            const readOnlyWallet = {
                publicKey: readOnlyKeypair.publicKey,
                payer: readOnlyKeypair,
                signTransaction: async <T extends import('@solana/web3.js').Transaction | import('@solana/web3.js').VersionedTransaction>(tx: T) => tx,
                signAllTransactions: async <T extends import('@solana/web3.js').Transaction | import('@solana/web3.js').VersionedTransaction>(txs: T[]) => txs,
            };
            this.program = createProgram(this.connection, readOnlyWallet);
            this.initialized = true;
            return true;
        }
        return false;
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

        if (isBlacklisted(daData.siteUrl)) {
            return {
                success: false,
                message: 'Domain is blacklisted',
                error: 'This site is not allowed in this indexer'
            };
        }
        
        try {
            // search on solana for this root
            const chainResult = await this.findRootOnChain(daData.root);
            if (!chainResult.found) {
                return {
                    success: false,
                    message: 'Root not found on chain',
                    error: 'This root has no matching CID in chain results'
                };
            }
            // verify proof
            const verificationResult = await ProofVerifier.verifyProof(daData.proof, chainResult.root!);
            
            if (!verificationResult.isValid) {
                return {
                    success: false,
                    message: 'Proof verification failed',
                    error: verificationResult.error
                };
            }

            // save to db
            const result = await this.saveToMongoDB({
                cid: chainResult.cid!,
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

    // search Solana program for a completed request whose result_root matches targetRoot
    private async findRootOnChain(targetRoot: string): Promise<{
        found: boolean;
        cid?: string;
        root?: string;
    }> {
        if (!this.initialized) this.initializeContract();
        if (!this.program) return { found: false };

        const targetNormalized = this.normalizeRoot(targetRoot);

        try {
           const accounts = await this.program.account.verificationRequest.all([
                {
                    memcmp: {
                        offset: 56, 
                        bytes: bs58.encode(Buffer.from([1])),
                    },
                },
            ]);
            for (const { account } of accounts) {
                if (!account.resultRoot) continue;
                const resultRootBytes = account.resultRoot as number[] | Uint8Array;
                const resultRootHex = Buffer.from(resultRootBytes).toString('hex');
                if (this.normalizeRoot(resultRootHex) !== targetNormalized) continue;
                const cid = account.cid;
                return {
                    found: true,
                    cid,
                    root: resultRootHex,
                };
            }
            return { found: false};
        } catch {
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