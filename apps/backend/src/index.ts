import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { CircuitProof } from "@openseo/zkproof";
import { getOpenSEOABI } from "@openseo/contract";
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.HTML_OWNER_PORT || "";
const FILECOIN_URL = process.env.FILECOIN_URL || '';
const DA_URL = process.env.DA_URL || '';

const pendingRoots: Record<string, string> = {};
// file upload
const TEMP_UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(TEMP_UPLOADS_DIR)) {
    fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, TEMP_UPLOADS_DIR),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, `temp-${uniqueSuffix}-${file.originalname}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
});

const HARDHAT_TEST_ACCOUNT = process.env.HARDHAT_TEST_ACCOUNT || "";
const HARDHAT_CHAIN_ID = 31337;

function createProvider(rpcUrl: string): ethers.JsonRpcProvider {
    const isLocalhost = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1");
    if (isLocalhost && rpcUrl) {
        return new ethers.JsonRpcProvider(rpcUrl, HARDHAT_CHAIN_ID);
    }
    return new ethers.JsonRpcProvider(rpcUrl);
}

export async function convertHtmlToTransportationTree(
    htmlContent: string,
    keywords: string[]
): Promise<{ htmlRoot: string; wordHashes: string[] }> {
    const result = await CircuitProof.generateProof(htmlContent, keywords);
    if (!result.success) {
        throw new Error('Failed to generate proof');
    }

    return {
        htmlRoot: result.htmlRoot,
        wordHashes: result.wordHashes
    }
}

async function getWalletWithBalance(
    provider: ethers.JsonRpcProvider,
    privateKey: string | undefined,
    isLocalhost: boolean
): Promise<ethers.Wallet | null> {
    if (privateKey) {
        let cleanKey = privateKey.split('//')[0].trim();
        if (!cleanKey.startsWith('0x')) cleanKey = '0x' + cleanKey;

        const wallet = new ethers.Wallet(cleanKey, provider);
        const balance = await provider.getBalance(wallet.address);

        if (balance > 0n) {
            console.log(`[HTML Owner] Wallet: ${wallet.address}, Balance: ${ethers.formatEther(balance)} ETH`);
            return wallet;
        }
    }

    if (isLocalhost) {
        const testWallet = new ethers.Wallet(HARDHAT_TEST_ACCOUNT, provider);
        const testBalance = await provider.getBalance(testWallet.address);
        console.log(`[HTML Owner] Using Hardhat test account: ${testWallet.address}, Balance: ${ethers.formatEther(testBalance)} ETH`);
        return testWallet;
    }

    return null;
}

app.post('/send_file', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File is required. Please upload an HTML file.' });
        }

        const keywords = req.body.keywords
            ? (typeof req.body.keywords === 'string' ? JSON.parse(req.body.keywords) : req.body.keywords)
            : [];

        if (!Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({ error: 'keywords (array) is required' });
        }

        // Read file content
        const tempFilePath = req.file.path;
        const htmlContent = fs.readFileSync(tempFilePath, 'utf-8');

        // Send file to FileCoin
        const filecoinResponse = await axios.post(`${FILECOIN_URL}/send_file`, { file: htmlContent });
        if (!filecoinResponse.data.success || !filecoinResponse.data.cid) {
            return res.status(500).json({ error: 'Failed to store file in FileCoin' });
        }

        const cid = String(filecoinResponse.data.cid);
        fs.unlinkSync(tempFilePath);

        const contractAddress = process.env.CONTRACT_ADDRESS;
        if (!contractAddress) {
            return res.status(200).json({
                success: true,
                cid,
                warning: 'Contract address not configured'
            });
        }

        // ethereum connection
        const rpcUrl = process.env.ETHEREUM_RPC_URL || '';
        const isLocalhost = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1");
        const provider = createProvider(rpcUrl);
        const wallet = await getWalletWithBalance(provider, process.env.OWNER_PRIVATE_KEY, isLocalhost);

        if (!wallet) {
            return res.status(400).json({ 
                error: 'No wallet with balance available. Please configure OWNER_PRIVATE_KEY or ensure Hardhat node is running.' 
            });
        }

        const contract = new ethers.Contract(contractAddress, getOpenSEOABI(), wallet);
        // fee
        let feeAmount = process.env.VERIFICATION_FEE || "";
        feeAmount = feeAmount.replace(/\s*(ETH|eth)\s*/gi, '').trim();
        const verificationFee = ethers.parseEther(feeAmount);

        // simulate transaction bu gerekli mi mesela 
        try {
            await contract.submitRequest.staticCall(cid, keywords, { value: verificationFee });
        } catch (simError: any) {
            const reason = simError.reason || simError.message || 'Unknown error';
            throw new Error(reason.includes('already exists') || reason.includes('Active request')
                ? 'verification request already exists for this cid'
                : reason
            );
        }

        const tx = await contract.submitRequest(cid, keywords, {
            value: verificationFee,
            gasLimit: 500000
        });

        const receipt = await tx.wait();
        return res.status(200).json({
            success: true,
            cid,
            ethereum: {
                success: true,
                txHash: receipt.hash,
                blockNumber: receipt.blockNumber
            },
            message: 'File stored in FileCoin and verification request sent to Ethereum'
        });

    } catch (error: any) {
        console.error('Error in /send_file:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

//RequestCompleted event by polling contract results
async function waitForConsensus(
    contract: ethers.Contract,
    expectedRoot: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 2000
): Promise<{ success: boolean; cid?: string; error?: string }> {
    const startTime = Date.now();
    const normalizeRoot = (r: string) => r.toLowerCase().replace(/^0x/, '');
    const normalizedExpected = normalizeRoot(expectedRoot);

    while (Date.now() - startTime < maxWaitMs) {
        // Get recent RequestCompleted events
        const provider = contract.runner?.provider as ethers.Provider;
        if (!provider) break;
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 50);
        const events = await contract.queryFilter(
            contract.filters.RequestCompleted(),
            fromBlock,
            currentBlock
        );

        for (const event of events) {
            if (event instanceof ethers.EventLog && event.args) {
                const cid = String(event.args[0]);
                const success = event.args[1];

                if (success) {
                    const result = await contract.results(cid);
                    const resultRoot = result.resultRoot;

                    if (resultRoot && normalizeRoot(resultRoot) === normalizedExpected) {
                        return { success: true, cid };
                    }
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    return { success: false, error: 'Consensus timeout' };
}

app.post('/generate_proof_and_submit', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'HTML file is required' });
        }

        const keywords = req.body.keywords
            ? (typeof req.body.keywords === 'string' ? JSON.parse(req.body.keywords) : req.body.keywords)
            : [];

        if (!Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({ error: 'keywords (array) is required' });
        }

        const siteUrl = req.body.siteUrl || req.body.site_url;
        if (!siteUrl) {
            return res.status(400).json({ error: 'siteUrl is required' });
        }

        // Read HTML content
        const tempFilePath = req.file.path;
        const htmlContent = fs.readFileSync(tempFilePath, 'utf-8');

        // generate proof
        const proofResult = await CircuitProof.generateProof(htmlContent, keywords);

        if (!proofResult.success || !proofResult.proof) {
            fs.unlinkSync(tempFilePath);
            return res.status(400).json({
                error: 'Proof generation failed',
                details: proofResult.error
            });
        }

        // verify proof 
        const verifyResult = await CircuitProof.verifyProof(proofResult.proof, proofResult.htmlRoot);
        if (!verifyResult.isValid) {
            fs.unlinkSync(tempFilePath);
            return res.status(400).json({
                error: 'Proof verification failed',
                details: verifyResult.error
            });
        }

        // Upload to FileCoin
        const filecoinResponse = await axios.post(`${FILECOIN_URL}/send_file`, { file: htmlContent });
        if (!filecoinResponse.data.success || !filecoinResponse.data.cid) {
            fs.unlinkSync(tempFilePath);
            return res.status(500).json({ error: 'Failed to store file in FileCoin' });
        }
        const cid = String(filecoinResponse.data.cid);

        // Submit request to Ethereum contract
        const contractAddress = process.env.CONTRACT_ADDRESS;
        if (contractAddress) {
            const rpcUrl = process.env.ETHEREUM_RPC_URL || '';
            const isLocalhost = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1");
            const provider = createProvider(rpcUrl);
            const wallet = await getWalletWithBalance(provider, process.env.OWNER_PRIVATE_KEY, isLocalhost);

            if (!wallet) {
                fs.unlinkSync(tempFilePath);
                return res.status(400).json({ 
                    error: 'No wallet with balance available. Please configure OWNER_PRIVATE_KEY or ensure Hardhat node is running.' 
                });
            }

            const contract = new ethers.Contract(contractAddress, getOpenSEOABI(), wallet);
            
            let feeAmount = process.env.VERIFICATION_FEE || "";
            feeAmount = feeAmount.replace(/\s*(ETH|eth)\s*/gi, '').trim();
            const verificationFee = ethers.parseEther(feeAmount);

            try {
                await contract.submitRequest.staticCall(cid, keywords, { value: verificationFee });
            } catch (simErr: any) {
                fs.unlinkSync(tempFilePath);
                const msg = simErr.reason || simErr.message || String(simErr);
                const userMsg = msg.includes('Active request') || msg.includes('already exists')
                    ? 'Verification request already exists for this CID. Wait for consensus or use a different file.'
                    : msg;
                return res.status(400).json({ error: userMsg });
            }

            pendingRoots[cid] = proofResult.htmlRoot;
            let tx: ethers.ContractTransactionResponse;
            try {
                tx = await contract.submitRequest(cid, keywords, {
                    value: verificationFee,
                    gasLimit: 500000
                });
            } catch (sendErr: any) {
                fs.unlinkSync(tempFilePath);
                const errMsg = sendErr.message || String(sendErr);
                const isRpcInternal = errMsg.includes('Internal error') || errMsg.includes('-32603') || errMsg.includes('UNKNOWN_ERROR');
                return res.status(400).json({
                    error: isRpcInternal
                        ? 'Transaction rejected by RPC (often: request already exists for this CID, or chain ID mismatch). Try again with a new file or restart Hardhat.'
                        : errMsg
                });
            }
            const receipt = await tx.wait();
            if (receipt) {
                console.log('[HTML Owner] Request submitted. TxHash:', receipt.hash, 'Block:', receipt.blockNumber);
            }

            // Wait for Ethereum consensus
            console.log('[HTML Owner] Waiting for consensus; expected root:', proofResult.htmlRoot);
            const consensusResult = await waitForConsensus(contract, proofResult.htmlRoot, 180000, 2000);
            console.log('[HTML Owner] Consensus Result:', consensusResult);

            if (!consensusResult.success) {
                fs.unlinkSync(tempFilePath);
                return res.status(400).json({
                    error: 'Consensus not reached',
                    details: consensusResult.error,
                    proof: {
                        root: proofResult.htmlRoot,
                        totalScore: proofResult.totalScore
                    }
                });
            }
        }

        // submit to DA after consensus
        const daResponse = await axios.post(`${DA_URL}/submit_proof`, {
            proof: proofResult.proof,
            root: proofResult.htmlRoot,
            keywords: keywords,
            siteUrl: siteUrl,
            totalScore: proofResult.totalScore
        }, {
            timeout: 60000,
            headers: { 'Content-Type': 'application/json' }
        });

        fs.unlinkSync(tempFilePath);
        if (daResponse.data.success) {
            return res.status(200).json({
                success: true,
                message: 'Proof generated, verified and submitted to DA',
                proof: {
                    proof: proofResult.proof,
                    root: proofResult.htmlRoot,
                    totalScore: proofResult.totalScore,
                    verified: true
                },
                da: daResponse.data
            });
        } else {
            return res.status(400).json({
                success: false,
                error: 'DA submission failed',
                proof: {
                    proof: proofResult.proof,
                    root: proofResult.htmlRoot,
                    totalScore: proofResult.totalScore,
                    verified: true
                },
                da: daResponse.data
            });
        }

    } catch (error: any) {
        console.error('[HTML Owner] Error in /generate_proof_and_submit:', error.message);
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        if (error.response) {
            console.error('[HTML Owner] DA Response Error:', error.response.data);
            return res.status(error.response.status).json({
                error: error.message,
                daError: error.response.data
            });
        }

        return res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});

app.post('/claim_refund', async (req: Request, res: Response) => {
    const { cid } = req.body;
    if (!cid) {
        return res.status(400).json({ error: 'CID is required' });
    }

    const contractAddress = process.env.CONTRACT_ADDRESS;
    if (!contractAddress) {
        return res.status(400).json({ error: 'Contract address not configured' });
    }

    const rpcUrl = process.env.ETHEREUM_RPC_URL || '';
    const isLocalhost = rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1");
    const provider = createProvider(rpcUrl);
    const wallet = await getWalletWithBalance(provider, process.env.OWNER_PRIVATE_KEY, isLocalhost);

    if (!wallet) {
        return res.status(400).json({ error: 'No wallet with balance available' });
    }

    try {
        const contract = new ethers.Contract(contractAddress, getOpenSEOABI(), wallet);
        try {
            await contract.claimRefund.staticCall(cid);
        } catch (simError: any) {
            const reason = simError.reason || simError.message || 'Unknown error';
            if (reason.includes('Not found')) {
                return res.status(404).json({ error: 'Request not found for this CID' });
            }
            if (reason.includes('Wait timeout')) {
                return res.status(400).json({ error: 'Timeout period not reached yet. Please wait.' });
            }
            if (reason.includes('Not owner')) {
                return res.status(403).json({ error: 'Only the original requester can claim refund' });
            }
            throw new Error(reason);
        }

        const tx = await contract.claimRefund(cid, { gasLimit: 200000 });
        const receipt = await tx.wait();
        return res.status(200).json({
            success: true,
            message: 'Refund claimed successfully',
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber
        });

    } catch (ethError: any) {
        console.error('[HTML Owner] Refund error:', ethError.message);
        return res.status(500).json({ error: ethError.message });
    }
});

app.listen(PORT, () => {
    console.log(`[HTML Owner] Server running on port ${PORT}`);
});

export default app;