# OpenSEO Backend
The HTML Owner Service is the user-facing gateway of the OpenSEO platform. It allows users to upload their website's HTML content, generate Zero-Knowledge Proofs (ZKP), and submit verification requests to the blockchain and Data Availability (DA) layer.

This service acts as the Prover in the ZK system, generating cryptographic proofs that assert a website's content and SEO score without revealing the raw data.

# HTML Upload & Processing: 
Accepts HTML files and keyword lists from users.

# Filecoin Integration: 
Automatically uploads raw HTML content to Filecoin for decentralized storage.

# Blockchain Submission: 
Submits verification requests to the OpenSEO Smart Contract, including the CID and verification fee.

# ZK Proof Generation:
Generates cryptographic proofs (using Noir/UltraHonk) verifying keyword presence and SEO scores.

# DA Layer Submission: 
Submits the generated proof and metadata to the Data Availability Layer for permanent indexing.

# Refund Claiming: 
Allows users to claim refunds for expired or unfulfilled verification requests.

# Installation:
pnpm install

# Configuration:
OWNER_PRIVATE_KEY 
CONTRACT_ADDRESS
ETHEREUM_RPC_URL
FILECOIN_URL
HTML_OWNER_PORT
DA_URL
HARDHAT_TEST_ACCOUNT
WORKER_API_KEY  

# Running the Service:
pnpm --filter backend run start

# API Reference
1. Upload File & Request Verification
Uploads an HTML file, stores it on Filecoin, and submits a verification request to the blockchain.
Endpoint: POST /send_file
Content-Type: multipart/form-data

Body:
file: The HTML file to upload.
keywords: JSON string or array of keywords (e.g., ["seo", "crypto"]).

2. Generate Proof & Submit to DA
Generates a ZK proof locally, waits for blockchain consensus, and then submits the proof to the Data Availability layer.
Endpoint: POST /generate_proof_and_submit
Content-Type: multipart/form-data

Body:
file: The HTML file.
keywords: Array of keywords.
siteUrl: The URL of the website being verified.