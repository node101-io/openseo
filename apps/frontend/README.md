# OpenSEO Webapp

The OpenSEO webapp provides a user interface for searching and verifying decentralized SEO proofs. It serves as the primary way for end users to interact with the OpenSEO ecosystem.

## Primary Functions

- **Keyword Search**

  Users can search for websites by entering keywords. The search queries the indexer service and returns a ranked list of verified websites that contain the specified keywords. Results are ordered by SEO score, which is computed based on keyword placement within HTML tags.

- **Proof Verification**

  Each search result includes a "Verify" button that allows users to independently verify the zero-knowledge proof associated with that result. This verification is performed client-side by calling the indexer's verification endpoint, ensuring that users don't need to trust the search results blindly.

- **Result Display**

  Search results display the website URL, matched keywords, total SEO score, and verification status. Users can click through to visit the actual website or verify the proof before trusting the ranking.

## Purpose

This webapp demonstrates the end-user experience of a decentralized search engine. Unlike traditional search engines where rankings are opaque and controlled by a central authority, OpenSEO rankings are based on cryptographically verifiable proofs.

The interface is intentionally minimal to focus on the core functionality. Website owners submit their sites through the backend API, and users search and verify through this webapp. The separation ensures that the search experience remains simple while the complexity of proof generation and verification happens behind the scenes.

Since all proofs are stored on-chain and in the indexer, users can verify any result at any time. The webapp simply provides a convenient interface for this verification - the same verification could be performed using command-line tools or other interfaces.

## Running

```bash
# Development server
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start
```

## Technology

- Next.js 14 with App Router
- Tailwind CSS for styling
- Client-side proof verification
