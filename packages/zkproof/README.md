# OpenSEO ZKProof
The zkproof package provides zero-knowledge proof generation and verification capabilities for HTML content. It uses Noir circuits compiled with Barretenberg to create succinct proofs that a given HTML document contains specific keywords.

## Primary Functions
- **HTML Parsing and Scoring**
  Parses HTML documents and extracts text content with associated tag weights. Keywords found in high-value tags (title, h1, meta) receive higher scores than those in body text. This scoring system forms the basis of the SEO ranking.

- **Proof Generation**
  Generates a zero-knowledge proof that commits to the HTML content structure and keyword positions. The proof includes a Merkle root (html_root) that uniquely identifies the document-keyword combination, along with the total SEO score.

- **Proof Verification**
  Verifies that a given proof is valid for a specific HTML root. This verification can be performed by anyone without access to the original HTML content, enabling trustless verification of SEO claims.

- **Root Computation**
  Provides a lightweight function to compute only the HTML root without generating a full proof. This is used by verification nodes to quickly compute expected values before participating in consensus.

## Purpose
Zero-knowledge proofs are the cryptographic foundation that makes OpenSEO trustless. Without ZK proofs, users would need to trust that the indexer correctly computed SEO scores. With ZK proofs, anyone can verify that a claimed score is mathematically correct.

The circuit design ensures that:
1. The HTML root uniquely identifies a specific HTML document with specific keywords
2. The SEO score is computed deterministically based on keyword positions and tag weights
3. No information about non-keyword content is revealed in the proof

This package is designed to be used both by the backend (for proof generation) and potentially by clients (for verification). The separation from the backend allows for future optimizations like client-side proving or dedicated prover infrastructure.

## Usage
This package is exported as `@openseo/zkproof`:

```typescript
import { CircuitProof, ProofVerifier, HTMLParser } from '@openseo/zkproof';

// Generate a full proof
const result = await CircuitProof.generateProof(htmlContent, keywords);
// Returns: { proof, htmlRoot, totalScore, wordScorePairs, ... }

// Verify a proof
const verification = await ProofVerifier.verifyProof(proof, expectedHtmlRoot);
// Returns: { isValid, verifyTime, error }

// Compute only the root (no proof)
const { htmlRoot, totalScore } = await CircuitProof.generateHtmlRoot(htmlContent, keywords);
```

## Requirements
- Nargo (Noir compiler) for circuit compilation
- Barretenberg CLI (bb) for proof generation and verification