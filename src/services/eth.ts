import { ethers } from 'ethers';

interface EthereumConfig {
    rpcUrl: string; 
    contractAddress: string;
    privateKey: string;
    contractABI: any[];
}

export async function sendOutputToEthereum(
    htmlRoot: string,
    cid: string,
    config: EthereumConfig
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
        if (!htmlRoot.startsWith('0x') || htmlRoot.length !== 66) {
            return {
                success: false,
                error: `Invalid htmlRoot format. Expected 0x + 64 hex chars, got: ${htmlRoot}`
            };
        }

        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const wallet = new ethers.Wallet(config.privateKey, provider);
        const contract = new ethers.Contract(
            config.contractAddress,
            config.contractABI,
            wallet
        );

        // submitVerification(string calldata cid, bytes32 htmlRoot) external authNodes
        const tx = await contract.submitVerification(cid, htmlRoot, {
            gasLimit: 500000
        });
        
        const receipt = await tx.wait();
        
        return {
            success: true,
            txHash: receipt.hash
        };
        
    } catch (error: any) {
        console.error('[Ethereum Service] Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}