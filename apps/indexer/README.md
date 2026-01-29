# OpenSEO Indexer
The indexer service stores and queries ZK proof metadata for the OpenSEO ecosystem. It receives proofs from the DA layer, verifies them against the chain and the ZK verifier, and exposes search and verification APIs for the frontend and other services.

## Purpose
The indexer is the central store for verified SEO proofs. When a site is submitted and its proof is broadcast from the DA service, the indexer checks that the root exists on Ethereum and that the ZK proof is valid, then persists the record in MongoDB. The frontend uses the indexer’s `/search` and `/verify-proof` endpoints to show ranked results and allow users to verify proofs.

## Running
pnpm --filter indexer start

# Installation:
pnpm install

# Configuration:
INDEXER_PORT 
INDEXER_WS_PORT
MONGODB_URI
ETHEREUM_RPC_URL
CONTRACT_ADDRESS