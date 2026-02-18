# OpenSEO ZKProof
The zkproof package provides zero-knowledge proof generation and verification for HTML content. It uses a Noir circuit (compiled with Nargo/Barretenberg) to prove that a given HTML document contains specific keywords and yields a specific SEO score, and exposes Node.js APIs used by the backend and indexer.

## Purpose
ZK proofs are the cryptographic basis for trustless OpenSEO. The backend generates proofs when a site is submitted; the indexer and frontend verify them. The circuit commits to an HTML root and total score without revealing the full document, so anyone can check that a claimed score is correct.

## Features
- **HTML parsing and scoring**  
  `HTMLParser` parses HTML and extracts words with tag weights. Used to build circuit inputs and compute SEO score.

- **Proof generation**  
  `CircuitProof.generateProof(html, keywords)` — parses HTML, builds circuit inputs, runs the Noir prover (via Barretenberg), and returns proof + public inputs (html_root, total_score). Used by the backend when submitting a site.

- **Proof verification**  
  `ProofVerifier.verifyProof(proofWrapperJSON, expectedHtmlRoot)` — verifies a proof against an expected root using bb.js. Used by the indexer and can be used by the frontend (or the frontend uses Noir/bb.js directly).

- **Root computation**  
  The circuit’s public output includes the HTML root; the same root can be computed from the circuit inputs for consistency with the contract and indexer.

## Usage
This package is consumed as `@openseo/zkproof` by the backend, indexer, and frontend

## Running (zkproof package only)
pnpm --filter @openseo/zkproof prove   # nargo prove
pnpm --filter @openseo/zkproof verify  # nargo verify