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

# Expired Request Cleanup:
Automatically cleans up expired verification requests from the blockchain (runs every 24 hours).

# Installation:
pnpm install

# Configuration:
CONTRACT_ADDRESS
ETHEREUM_RPC_URL

# Running the Service:
Run all nodes:
pnpm --filter nodes run start