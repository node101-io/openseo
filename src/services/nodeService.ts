import { ethers } from 'ethers';
import axios from 'axios';
import { CircuitProof } from '../helper/utils/prover/CircuitProof.js';
import { getOpenSEOABI } from './contractABI.js';

export class NodeService {
    private provider!: ethers.JsonRpcProvider;
    private contract!: ethers.Contract;
    private wallet!: ethers.Wallet;
    private nodeName: string;
    private nodePrivateKey: string;
    private contractAddress: string;
    private rpcUrl: string;
    private filecoinUrl: string;
    private lastProcessedBlock: number = 0;
    private pollingInterval: NodeJS.Timeout | null = null;
    private completedRequests: Set<string> = new Set(); 
    private processingRequests: Set<string> = new Set(); 
    private isPolling: boolean = false; 

    constructor(
        nodeName: string,
        nodePrivateKey: string,
        contractAddress: string,
        rpcUrl: string,
        filecoinUrl: string
    ) {
        this.nodeName = nodeName;
        this.nodePrivateKey = nodePrivateKey;
        this.contractAddress = contractAddress;
        this.rpcUrl = rpcUrl;
        this.filecoinUrl = filecoinUrl;
    }

    private parseEventArg(arg: any): any {
        if (Array.isArray(arg)) {
            return arg.map(item => item.toString());
        }
        if (arg && typeof arg === 'object' && arg.hash) {
            return arg.hash;
        }
        if (typeof arg === 'string') {
            return arg;
        }
        if (arg && typeof arg.toString === 'function') {
            return arg.toString();
        }
        return String(arg);
    }

    async initialize() {
        if (!this.contractAddress) {
            console.warn(`[${this.nodeName}] contract address not found`);
            return false;
        }

        const isLocalhost = this.rpcUrl.includes("localhost") || this.rpcUrl.includes("127.0.0.1");
        let privateKey = this.nodePrivateKey.split('//')[0].trim();
        if (!privateKey.startsWith('0x')) {
            privateKey = '0x' + privateKey;
        }

        try {
            this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
            const tempWallet = new ethers.Wallet(privateKey, this.provider);
            const balance = await this.provider.getBalance(tempWallet.address);
            
            if (balance === 0n && isLocalhost) {
                const testAccounts = [
                    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", 
                    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", 
                    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
                    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", 
                ];
                
                const nodeNum = parseInt(this.nodeName.replace(/^\D+/g, '')) || 1; 
                const accountIndex = Math.min(nodeNum, testAccounts.length - 1);
                privateKey = testAccounts[accountIndex];
                console.log(`[${this.nodeName}] Using Hardhat test account #${accountIndex}`);
            }
            
            this.wallet = new ethers.Wallet(privateKey, this.provider);
            const contractABI = getOpenSEOABI();
            this.contract = new ethers.Contract(this.contractAddress, contractABI, this.wallet);
        
            console.log(`[${this.nodeName}] Ethereum connected. Address: ${this.wallet.address}, Balance: ${ethers.formatEther(balance)} ETH`);
            return true;
        } catch (error: any) {
            console.error(`[${this.nodeName}] Failed to setup Ethereum:`, error.message);
            return false;
        }
    }

    async startEventListener() {
        if (!this.contract) {
            console.warn(`[${this.nodeName}] Contract not initialized, event listener not started`);
            return;
        }
        
        const currentBlock = await this.provider.getBlockNumber();
        console.log(`[${this.nodeName}] Current block: ${currentBlock}`);
        this.lastProcessedBlock = currentBlock;
        console.log(`[${this.nodeName}] Starting polling from block ${this.lastProcessedBlock}`);
        
        this.pollingInterval = setInterval(async () => {
            if (this.isPolling) {
                return;
            }
            
            this.isPolling = true;
            
            try {
                const currentBlock = await this.provider.getBlockNumber();
                if (currentBlock > this.lastProcessedBlock) {
                    const fromBlock = this.lastProcessedBlock + 1;
                    console.log(`[${this.nodeName}] Polling blocks ${fromBlock} to ${currentBlock}...`);
                    
                    // Event: RequestCompleted(uint256 indexed requestId, bool success)
                    const completedEvents = await this.contract.queryFilter(
                        this.contract.filters.RequestCompleted(),
                        fromBlock,
                        currentBlock
                    );
                    
                    if (completedEvents.length > 0) {
                        console.log(`[${this.nodeName}] Found ${completedEvents.length} RequestCompleted events`);
                    }
                    
                    for (const event of completedEvents) {
                        if (event instanceof ethers.EventLog && event.args) {
                            const requestId = event.args[0].toString();
                            const success = event.args[1];
                            this.completedRequests.add(requestId);
                            this.processingRequests.delete(requestId); 
                            console.log(`[${this.nodeName}] Request ${requestId} completed (success: ${success})`);
                        }
                    }
                    
                    // Event: VerificationRequested(uint256 indexed requestId, string cid, string[] keywords, address requester)
                    const newEvents = await this.contract.queryFilter(
                        this.contract.filters.VerificationRequested(),
                        fromBlock,
                        currentBlock
                    );
                    
                    if (newEvents.length > 0) {
                        console.log(`[${this.nodeName}] Found ${newEvents.length} VerificationRequested events`);
                    }
                    
                    for (const event of newEvents) {
                        if (event instanceof ethers.EventLog && event.args) {
                            const requestId = BigInt(event.args[0]); 
                            const requestIdStr = requestId.toString();
                            const cid = String(event.args[1]); 
                            const keywords = this.parseEventArg(event.args[2]); 
                            
                            if (this.completedRequests.has(requestIdStr)) {
                                console.log(`[${this.nodeName}] Request ${requestId} already completed`);
                                continue;
                            }
                            
                            if (this.processingRequests.has(requestIdStr)) {
                                console.log(`[${this.nodeName}] Request ${requestId} already being processed`);
                                continue;
                            }
                            
                            this.processingRequests.add(requestIdStr);                            
                            console.log(`[${this.nodeName}] New verification request. ID: ${requestId}, CID: ${cid}`);                            
                            await this.processVerificationRequest(cid, keywords, requestId);
                        }
                    }
                    
                    this.lastProcessedBlock = currentBlock;
                }
            } catch (error: any) {
                console.error(`[${this.nodeName}] Polling error:`, error.message);
            } finally {
                this.isPolling = false;
            }
        }, 3000); 
        
        console.log(`[${this.nodeName}] Event listener started`);
    }

    private async processVerificationRequest(cid: string, keywords: string[], requestId: bigint) {
        try {
            try {
                const [requester, timestamp, isProcessed, resultRoot] = 
                    await this.contract.getRequestDetails(requestId);
                
                if (isProcessed) {
                    this.completedRequests.add(requestId.toString());
                    console.log(`[${this.nodeName}] Request ${requestId} already processed`);
                    return;
                }

                const currentTime = BigInt(Math.floor(Date.now() / 1000));
                const VERIFICATION_TIMEOUT = 300n;
                if (currentTime > timestamp + VERIFICATION_TIMEOUT) {
                    console.log(`[${this.nodeName}] Request ${requestId} timeout exceeded`);
                    return;
                }
                
                try {
                    const dummyRoot = "0x0000000000000000000000000000000000000000000000000000000000000000";
                    await this.contract.submitVerification.staticCall(cid, dummyRoot);
                } catch (simulationError: any) {
                    if (simulationError.reason?.includes("Voted") || simulationError.message?.includes("Voted")) {
                        console.log(`[${this.nodeName}] Already voted for Request ${requestId}`);
                        return;
                    }
                    if (simulationError.reason?.includes("Processed") || simulationError.message?.includes("Processed")) {
                        this.completedRequests.add(requestId.toString());
                        console.log(`[${this.nodeName}] Request ${requestId} already processed (from simulation)`);
                        return;
                    }
                }

            } catch (contractError: any) {
                console.error(`[${this.nodeName}] Failed to fetch request details:`, contractError.message);
                return; 
            }
            
            if (!keywords || keywords.length === 0) {
                console.error(`[${this.nodeName}] No keywords found for CID: ${cid}`);
                return;
            }
                        
            const randomDelay = Math.floor(Math.random() * 2000) + 500;
            await new Promise(resolve => setTimeout(resolve, randomDelay));
            
            console.log(`[${this.nodeName}] Processing CID: ${cid} with keywords: [${keywords.join(', ')}]`);            
            let fileContent;
            try {
                const filecoinResponse = await axios.get(`${this.filecoinUrl}/html_file/${cid}`, { timeout: 10000 });
                
                if (!filecoinResponse.data.success || !filecoinResponse.data.file) {
                    console.error(`[${this.nodeName}] File not found in FileCoin service for CID: ${cid}`);
                    return;
                }
                fileContent = filecoinResponse.data.file;
            } catch (err: any) {
                console.error(`[${this.nodeName}] Error fetching file from ${this.filecoinUrl}:`, err.message);
                return;
            }
            
            const result = await CircuitProof.generateHtmlRoot(
                fileContent,
                keywords,
                'v4'
            );
            
            if (!result.success || !result.htmlRoot) {
                console.error(`[${this.nodeName}] Failed to generate HTML root`);
                return;
            }

            const htmlRootBytes32 = result.htmlRoot.startsWith('0x') 
                ? result.htmlRoot 
                : '0x' + result.htmlRoot;

            console.log(`[${this.nodeName}] Calculated Root: ${htmlRootBytes32}`);
            const nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
            
            const tx = await this.contract.submitVerification(cid, htmlRootBytes32, {
                gasLimit: 500000,
                nonce
            });
            
            console.log(`[${this.nodeName}] Transaction sent: ${tx.hash}. Waiting for confirmation...`);
            
            const receipt = await tx.wait();
            console.log(`[${this.nodeName}] Verification confirmed! Block: ${receipt.blockNumber}`);
            
        } catch (error: any) {
            const errMsg = error.message || "";
            
            if (errMsg.includes("Voted")) {
                console.log(`[${this.nodeName}]Already voted.`);
            } else if (errMsg.includes("Processed")) {
                this.completedRequests.add(requestId.toString());
                console.log(`[${this.nodeName}]Request already processed.`);
            } else if (errMsg.includes("timeout")) {
                console.log(`[${this.nodeName}]Timeout.`);
            } else if (errMsg.includes("Internal error") || "") {
                this.completedRequests.add(requestId.toString());
                console.log(`[${this.nodeName}]consensus reached by other nodes.`);
            } else {
                console.error(`[${this.nodeName}] Unexpected error processing verification:`, errMsg);
            }
        } finally {
            this.processingRequests.delete(requestId.toString());
        }
    }

    stopEventListener() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log(`[${this.nodeName}] Event listener stopped`);
        }
    }

    getAddress(): string {
        return this.wallet?.address || '';
    }
}