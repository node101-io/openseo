# OpenSEO
Decentralized SEO verification platform. Website owners submit HTML and keywords; the system generates Zero-Knowledge proofs, stores data on-chain and in a Data Availability layer, and verification nodes reach consensus on content roots. Users search and verify results via the frontend.

### Apps
**Backend** HTML upload, ZK proof generation, contract submission, DA broadcast. Prover in the ZK flow. 
[backend]apps/backend/README.md
**Frontend** Search UI and proof verification. Queries indexer, verifies proofs in the browser. 
[frontend]apps/frontend/README.md
**Indexer** Stores and queries ZK proof metadata. Ingests DA broadcasts, verifies on-chain + ZK, exposes search and verify APIs.
[indexer](apps/indexer/README.md)
**Oracle Node** Verification nodes (Node1–3). Listen for contract events, fetch HTML from Filecoin, compute root, vote on-chain. 
[oracle-node](apps/oracle-node/README.md) 
**Mock Filecoin** Mock decentralized storage for HTML files. CID-based store/fetch. 
[mock-filecoin](apps/mock-filecoin/README.md)
| **Mock DA** | Mock Data Availability layer. Receives proofs and forwards to indexer.
[mock-da](apps/mock-da/README.md)

### Packages
**@openseo/contract** OpenSEO Solidity contract (verification requests, node voting, consensus). ABI and deploy scripts. 
[contract](packages/contract/README.md)
**@openseo/zkproof** ZK proof generation and verification (Noir/Barretenberg). HTML parsing, circuit proof, ProofVerifier. 
[zkproof](packages/zkproof/README.md) 
**@openseo/types** Shared TypeScript types. 

## Installation
pnpm install

## Configuration
- Root: no required env; each app has its own `.env` (see each app’s README).
- Common: `CONTRACT_ADDRESS`, `ETHEREUM_RPC_URL` for chain; `FILECOIN_URL`, indexer/DA URLs for services.

## Quick start (local)
1. `pnpm install`
2. **Hardhat node** 
   - pnpm --filter @openseo/contract node
2. **Tüm servisler** `pnpm dev`  
   - Turbo ile backend, frontend, indexer, mock-da, mock-filecoin, oracle-node paralel başlar.
3. **Contract’ı bir kez deploy et:** Node ayağa kalktıktan sonra başka bir terminalde:
   ```bash
   pnpm --filter @openseo/contract deploy:localhost
   ```
   - Çıkan `CONTRACT_ADDRESS`’i backend, indexer ve oracle-node `.env` dosyalarına yaz.
4. MongoDB’yi ayrıca çalıştır (indexer için).


Then open the frontend URL (e.g. `http://localhost:3000`) to search and verify.