import { ethers } from 'ethers';
import axios from 'axios';
import { CircuitProof } from "@openseo/zkproof";
import { getOpenSEOABI } from "@openseo/contract";

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
    private cleanupInterval: NodeJS.Timeout | null = null;
    private lastCleanupTime: number = 0;

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
            console.log(`[${this.nodeName}] Contract address: ${this.contractAddress}`);
            console.log(`[${this.nodeName}] RPC: ${this.rpcUrl || '(empty)'}`);

            const code = await this.provider.getCode(this.contractAddress);
            if (!code || code === '0x' || code === '0x0') {
                console.error(`[${this.nodeName}] No contract code at ${this.contractAddress}. Backend and nodes must use same CONTRACT_ADDRESS and same ETHEREUM_RPC_URL (same chain).`);
                return false;
            }

            const latestBlock = await this.provider.getBlockNumber();
            const allRequested = await this.contract.queryFilter(
                this.contract.filters.VerificationRequested(),
                0,
                latestBlock
            );
            console.log(`[${this.nodeName}] VerificationRequested on this chain (blocks 0..${latestBlock}): ${allRequested.length}`);
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

        this.lastProcessedBlock = 0;
        console.log(`[${this.nodeName}] Starting polling from block ${this.lastProcessedBlock} (will catch past events)`);

        this.pollingInterval = setInterval(async () => {
            this.isPolling = true;
            try {
                const currentBlock = await this.provider.getBlockNumber();
                if (currentBlock > this.lastProcessedBlock) {
                    const fromBlock = this.lastProcessedBlock + 1;
                    console.log(`[${this.nodeName}] Polling blocks ${fromBlock} to ${currentBlock}...`);

                    const completedEvents = await this.contract.queryFilter(
                        this.contract.filters.RequestCompleted(),
                        fromBlock,
                        currentBlock
                    );

                    console.log(`[${this.nodeName}] RequestCompleted events found: ${completedEvents.length}`);

                    for (const event of completedEvents) {
                        if (event instanceof ethers.EventLog && event.args) {
                            const cid = String(event.args[0]);
                            const success = event.args[1];
                            this.completedRequests.add(cid);
                            this.processingRequests.delete(cid);
                            console.log(`[${this.nodeName}] Request ${cid} completed (success: ${success})`);
                        }
                    }

                    const newEvents = await this.contract.queryFilter(
                        this.contract.filters.VerificationRequested(),
                        fromBlock,
                        currentBlock
                    );

                    const rawLogs = await this.provider.getLogs({
                        address: this.contractAddress as string,
                        fromBlock,
                        toBlock: currentBlock
                    });
                    console.log(`[${this.nodeName}] VerificationRequested: ${newEvents.length}, contract logs in range: ${rawLogs.length}`);

                for (const event of newEvents) {
                    if (event instanceof ethers.EventLog && event.args) {
                        const cid = String(event.args[0]);
                        const keywords = this.parseEventArg(event.args[1]);

                        if (this.completedRequests.has(cid)) {
                            console.log(`[${this.nodeName}] Request ${cid} already completed`);
                            continue;
                        }

                        if (this.processingRequests.has(cid)) {
                            console.log(`[${this.nodeName}] Request ${cid} already being processed`);
                            continue;
                        }
                        this.processingRequests.add(cid);
                        console.log(`[${this.nodeName}] New verification request. CID: ${cid}`);
                        await this.processVerificationRequest(cid, keywords);
                    }
                }
                this.lastProcessedBlock = currentBlock;
            }
            } catch (pollError: any) {
                console.error(`[${this.nodeName}] Polling error:`, pollError.message);
            }
        }, 3000);
        console.log(`[${this.nodeName}] Event listener started`);
        this.startCleanupTask();
    }

    private async cleanupExpiredRequests() {
        console.log(`[${this.nodeName}] Starting cleanup task for expired requests...`);
        const latestBlock = await this.provider.getBlock('latest');
        const chainTime = latestBlock?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
        const VERIFICATION_TIMEOUT = 300n;
        const currentBlock = await this.provider.getBlockNumber();
        const blocksPerDay = 7200;
        const fromBlock = currentBlock > blocksPerDay ? currentBlock - blocksPerDay : 0;
        const allEvents = await this.contract.queryFilter(
            this.contract.filters.VerificationRequested(),
            fromBlock,
            currentBlock
        );

        console.log(`[${this.nodeName}] Found ${allEvents.length} requests in the last 24 hours`);
        const expiredCids: string[] = [];

        for (const event of allEvents) {
            if (event instanceof ethers.EventLog && event.args) {
                const cid = String(event.args[0]);
                const request = await this.contract.requests(cid);
                const paymentAmount = request.paymentAmount?.toString() || '0';

                if (paymentAmount !== '0' && !request.isProcessed) {
                    let timestamp: bigint;
                    if (typeof request.timestamp === 'bigint') {
                        timestamp = request.timestamp;
                    } else {
                        timestamp = BigInt(request.timestamp.toString());
                    }

                    if (chainTime > timestamp + VERIFICATION_TIMEOUT) {
                        expiredCids.push(cid);
                        console.log(`[${this.nodeName}] Found expired request: ${cid}`);
                    }
                }
            }
        }

        console.log(`[${this.nodeName}] Found ${expiredCids.length} expired requests to cleanup`);
        let cleanedCount = 0;
        for (const cid of expiredCids) {
            try {
                const tx = await this.contract.cleanIsNotProcessedRequest(cid, { gasLimit: 100000 });
                await tx.wait();
                cleanedCount++;
                this.completedRequests.add(cid);
                this.processingRequests.delete(cid);
                console.log(`[${this.nodeName}] Cleaned up expired request from contract: ${cid}`);
            } catch (err: any) {
                const errMsg = err.message || "";
                if (errMsg.includes("Request not found") || errMsg.includes("Already processed")) {
                    this.completedRequests.add(cid);
                    this.processingRequests.delete(cid);
                    console.log(`[${this.nodeName}] Request ${cid} already cleaned/processed, marked locally`);
                } else {
                    console.error(`[${this.nodeName}] Error cleaning up request ${cid}:`, errMsg);
                }
            }
        }

        console.log(`[${this.nodeName}] Cleanup completed. ${cleanedCount}/${expiredCids.length} expired requests cleaned from contract.`);
    }

    private startCleanupTask() {
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;    
        this.lastCleanupTime = Date.now();
        this.cleanupExpiredRequests();

        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            if (now - this.lastCleanupTime >= ONE_DAY_MS) {
                this.lastCleanupTime = now;
                this.cleanupExpiredRequests();
            }
        }, ONE_DAY_MS);

        console.log(`[${this.nodeName}] Cleanup task scheduled to run every 24 hours`);
    }

    private async processVerificationRequest(cid: string, keywords: string[]) {
        try {
            let request: any;
            try {
                request = await this.contract.requests(cid);

                const paymentAmount = request.paymentAmount?.toString() || '0';
                if (paymentAmount === '0') {
                    console.log(`[${this.nodeName}] Request not found for CID: ${cid}`);
                    return;
                }
            } catch (error: any) {
                console.error(`[${this.nodeName}] Error reading request for CID ${cid}:`, error.message);
                return;
            }

            const isProcessed = request.isProcessed;

            if (isProcessed) {
                this.completedRequests.add(cid);
                console.log(`[${this.nodeName}] Request ${cid} already processed`);
                return;
            }

            let timestamp: bigint;
            try {
                if (typeof request.timestamp === 'bigint') {
                    timestamp = request.timestamp;
                } else if (typeof request.timestamp === 'string') {
                    timestamp = BigInt(request.timestamp);
                } else {
                    timestamp = BigInt(request.timestamp.toString());
                }
            } catch (error: any) {
                console.error(`[${this.nodeName}] Error parsing timestamp for CID ${cid}:`, error.message);
                return;
            }
            const latestBlock = await this.provider.getBlock('latest');
            const chainTime = latestBlock?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
            const VERIFICATION_TIMEOUT = 300n;
            if (chainTime > timestamp + VERIFICATION_TIMEOUT) {
                console.log(`[${this.nodeName}] Request ${cid} timeout exceeded (chain time ${chainTime} > ${timestamp} + ${VERIFICATION_TIMEOUT})`);
                return;
            }

            const hasVoted = await this.contract.hasVoted(cid, this.wallet.address);
            if (hasVoted) {
                console.log(`[${this.nodeName}] Already voted for CID ${cid}`);
                return;
            }


            if (!keywords || keywords.length === 0) {
                console.error(`[${this.nodeName}] No keywords found for CID: ${cid}`);
                return;
            }

            const randomDelay = Math.floor(Math.random() * 2000) + 500;
            await new Promise(resolve => setTimeout(resolve, randomDelay));

            console.log(`[${this.nodeName}] Processing CID: ${cid} with keywords: [${keywords.join(', ')}]`);
            let fileContent: string;
            try {
                const isR2Public = this.filecoinUrl.includes('r2.dev');
                if (isR2Public) {
                    const url = `${this.filecoinUrl.replace(/\/$/, '')}/${cid}`;
                    const res = await axios.get(url, { timeout: 10000, responseType: 'text' });
                    fileContent = typeof res.data === 'string' ? res.data : String(res.data);
                } else {
                    const filecoinResponse = await axios.get(`${this.filecoinUrl}/html_file/${cid}`, { timeout: 10000 });
                    if (!filecoinResponse.data.success || !filecoinResponse.data.file) {
                        console.error(`[${this.nodeName}] File not found in FileCoin service for CID: ${cid}`);
                        return;
                    }
                    fileContent = filecoinResponse.data.file;
                }
            } catch (err: any) {
                console.error(`[${this.nodeName}] Error fetching file from ${this.filecoinUrl}:`, err.message);
                return;
            }

            const result = await CircuitProof.generateHtmlRoot(fileContent, keywords);
            if (!result.success || !result.htmlRoot) {
                console.error(`[${this.nodeName}] Failed to generate HTML root`);
                return;
            }

            const htmlRootBytes32 = result.htmlRoot.startsWith('0x') ? result.htmlRoot : '0x' + result.htmlRoot;
            console.log(`[${this.nodeName}] Calculated Root: ${htmlRootBytes32}`);
            const nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");

            const tx = await this.contract.submitHtmlRoot(cid, htmlRootBytes32, {
                gasLimit: 500000,
                nonce
            });

            console.log(`[${this.nodeName}] Transaction sent: ${tx.hash}. Waiting for confirmation...`);

            const receipt = await tx.wait();
            console.log(`[${this.nodeName}] Verification confirmed! Block: ${receipt.blockNumber}`);

        } catch (error: any) {
            const errMsg = error.message || "";
            if (errMsg.includes("Voted")) {
                console.log(`[${this.nodeName}] Transaction rejected: Already voted.`);
            } else if (errMsg.includes("Processed")) {
                this.completedRequests.add(cid);
                console.log(`[${this.nodeName}] Transaction rejected: Request already processed.`);
            } else if (errMsg.includes("timeout")) {
                console.log(`[${this.nodeName}] Transaction rejected: Timeout.`);
            } else if (errMsg.includes("Internal error") || errMsg.includes("-32603")) {
                this.completedRequests.add(cid);
                console.log(`[${this.nodeName}] Transaction rejected: Request likely already processed or voted.`);
            } else {
                console.error(`[${this.nodeName}] Unexpected error processing verification:`, errMsg);
            }
        } finally {
            this.processingRequests.delete(cid);
        }
    }

    stopEventListener() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log(`[${this.nodeName}] Event listener stopped`);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log(`[${this.nodeName}] Cleanup task stopped`);
        }
    }

    getAddress(): string {
        return this.wallet?.address || '';
    }

    getNodeName(): string {
        return this.nodeName;
    }
}