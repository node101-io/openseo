# OpenSEO Frontend
The OpenSEO frontend provides the user interface for searching and verifying decentralized SEO proofs. It is the main application through which users interact with the OpenSEO ecosystem.

## Purpose
This app demonstrates the end-user experience of a decentralized search engine. Rankings are based on cryptographically verifiable proofs; because proofs are stored in the indexer and on-chain, users can verify any result at any time.

## Features
- **Keyword search**  
  Users search for websites by entering keywords. The search queries the indexer service and returns a ranked list of verified sites that match. Results are ordered by SEO score, computed from keyword placement within HTML tags.

- **Proof verification**  
  Each result includes a "Verify" button so users can independently verify the zero-knowledge proof. Verification uses the indexer’s verification endpoint and Noir/bb.js in the browser. Whether a result has been verified is stored in the browser's localStorage, keyed by the SHA-256 hash of the result. Hashing prevents manipulation.

- **Result display**  
  Shows URL, matched keywords, SEO score, and verification status. Users can visit the site or verify the proof first.

# Running the Service:
pnpm --filter frontend run start
