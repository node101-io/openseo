# OpenSEO Nodes (Verifier Network)
The Nodes Service represents the decentralized verifier network of the OpenSEO platform. Each node acts as an independent verifier that listens for blockchain verification requests, fetches HTML content from Filecoin, computes the cryptographic root hash, and submits votes to achieve consensus.

This service acts as the Verifier in the ZK system, independently validating website content and participating in the decentralized consensus mechanism.

# Blockchain Event Listening:
Polls the Ethereum blockchain for VerificationRequested events and processes new verification requests.

# Filecoin Integration:
Fetches HTML content from Filecoin storage using the CID provided in verification requests.

# Root Hash Computation:
Independently computes the merkle root hash of the HTML content using the ZK circuit utilities.

# Consensus Voting:
Submits computed root hashes to the smart contract, participating in the multi-node consensus mechanism.

# Duplicate Prevention:
Tracks processed and completed requests to avoid duplicate voting and unnecessary computation.

# Expired Request Cleanup:
Automatically cleans up expired verification requests from the blockchain (runs every 24 hours).

# Multi-Node Support:
Supports running multiple independent nodes (Node1, Node2, Node3) each with their own wallet and configuration.


# Installation:
pnpm install


# Configuration:
NODE1_PORT
NODE2_PORT
NODE3_PORT
NODE1_PRIVATE_KEY
NODE2_PRIVATE_KEY
NODE3_PRIVATE_KEY
CONTRACT_ADDRESS
ETHEREUM_RPC_URL
FILECOIN_URL


# Running the Service:
Run all nodes:
pnpm --filter nodes run start

Run individual nodes:
pnpm --filter nodes run start:node1
pnpm --filter nodes run start:node2
pnpm --filter nodes run start:node3


# Architecture
Each node operates independently and performs the following workflow:

1. Event Polling
Continuously polls the blockchain for new VerificationRequested events every 3 seconds.

2. Request Validation
Checks if the request is already processed, completed, or timed out before proceeding.

3. Content Fetching
Retrieves the HTML file from Filecoin storage service using the CID.

4. Root Computation
Computes the merkle root hash using CircuitProof.generateHtmlRoot() with the HTML content and keywords.

5. Vote Submission
Submits the computed root hash to the smart contract via submitHtmlRoot().

6. Consensus
When enough nodes submit matching root hashes, the smart contract achieves consensus and emits RequestCompleted.


# Consensus Mechanism
- Multiple nodes independently verify the same content
- Each node computes the root hash and submits a vote
- Smart contract requires a threshold of matching votes for consensus
- Prevents single point of failure and ensures decentralized verification


# Node Configuration
For local development with Hardhat, nodes automatically use test accounts:
- Node1: Hardhat Account #1
- Node2: Hardhat Account #2  
- Node3: Hardhat Account #3

For production, each node requires a unique private key with sufficient ETH for gas fees.
