# OpenSEO

Decentralized SEO verification platform. Website owners submit HTML and keywords; the system generates Zero-Knowledge proofs, stores data on-chain and in a Data Availability layer, and verification nodes reach consensus on content roots. Users search and verify results via the frontend.

### Apps

- **Backend** HTML upload, ZK proof generation, contract submission, DA broadcast. Prover in the ZK flow.
  [github-action](apps/github-action/README.md)
- **Frontend** Search UI and proof verification. Queries indexer, verifies proofs in the browser.
  [frontend](apps/frontend/README.md)
- **Indexer** Stores and queries ZK proof metadata. Ingests DA broadcasts, verifies on-chain + ZK, exposes search and verify APIs.
  [indexer](apps/indexer/README.md)
- **Oracle Node** Verification nodes (Node1–3). Listen for contract events, fetch HTML from Filecoin, compute root, vote on-chain.
  [oracle-node](apps/oracle-node/README.md)
- **Worker Filecoin** (Cloudflare) HTML storage in R2. POST /send_file, GET /html_file/:cid
  [worker-filecoin](apps/worker-filecoin/README.md)
- **Worker DA** (Cloudflare) Data Availability: POST /submit_proof, WebSocket /ws, GET /submissions. Broadcasts to indexers.
  [worker-da](apps/worker-da/README.md)

### Packages

- **@openseo/contracts** OpenSEO Solana contract (verification requests, node voting, consensus). IDL and deploy scripts.
  [contracts](packages/contracts/README.md)
- **@openseo/zkproof** ZK proof generation and verification (Noir/Barretenberg). HTML parsing, circuit proof, ProofVerifier.
  [zkproof](packages/zkproof/README.md)
- **@openseo/types** Shared TypeScript types.

## Installation

pnpm install

## Quick start (local)

1. `pnpm install`
2. **All services** `pnpm dev`
   - With Turbo, the github-action, frontend, indexer, and oracle node start in parallel. Deployed workers are used for DA and Filecoin (you don't need to run local workers).
3. **Deploy contract one time** Please read this [contracts](packages/contracts/README.md)
   - Write `PROGRAM_ID` and `SOLANA_RPC_URL` on github-action, indexer and oracle-node' s `.env` file.

Then open the frontend URL (e.g. `http://localhost:3000`) to search and verify.

# High-Level Diagram:

```mermaid
---
config:
 layout: dagre
---
flowchart TB
subgraph Storage_Layer["Decentralized Storage"]
       FC[("FileCoin")]
 end
subgraph Blockchain_Layer["L1 Blockchain"]
       SOL(("Solana Contracts"))
 end
subgraph Worker_Network["Oracle Nodes"]
       N1["Node 1"]
       N2["Node 2"]
       N3["Node 3"]
 end
subgraph OffChain_Layer["Off-Chain Components"]
       DA{"Data Availability"}
       IDX1["Indexer1"]
       IDX2["Indexer2"]
       IDX3["Indexer3"]
       DB[("MongoDB")]
 end
   SOL -- Verify Request --> Worker_Network
   Worker_Network -. Fetch Data .-> FC
   Worker_Network -- Submit Root --> SOL
   DA -- Broadcast Proof --> IDX1 & IDX2 & IDX3
   Worker_Network -- Submit Proof --> DA
   WSC["Web Site Creator"] -- Submit Proof --> DA
   WSC_Client["Web Site Client"] -- Search Query --> DA
   WSC -- Init Request --> SOL
   WSC -- Upload HTML --> FC
   IDX1 -. Get CID .-> SOL
   IDX1 -- Save Result --> DB
   IDX2 -. Get CID .-> SOL
   IDX2 -- Save Result --> DB
   IDX3 -. Get CID .-> SOL
   IDX3 -- Save Result --> DB
   IDX1 -. Ranking Sites .-> WSC_Client
   IDX2 -. Ranking Sites .-> WSC_Client
   IDX3 -. Ranking Sites .-> WSC_Client
   n3["n3"]
   n1["n1"]
   n2["n2"]

   n3@{ shape: anchor}
   n1@{ shape: anchor}
   n2@{ shape: anchor}
    FC:::Sky
    SOL:::Class_01
    N1:::Rose
    N2:::Rose
    N3:::Rose
    DA:::Pine
    IDX1:::Aqua
    IDX2:::Aqua
    IDX3:::Aqua
    DB:::Sky
    WSC:::Peach
    WSC_Client:::Class_03
   classDef Rose stroke-width:1px, stroke-dasharray:none, stroke:#FF5978, fill:#FFDFE5, color:#8E2236
   classDef Peach stroke-width:1px, stroke-dasharray:none, stroke:#FBB35A, fill:#FFEFDB, color:#8F632D
   classDef Ash stroke-width:1px, stroke-dasharray:none, stroke:#999999, fill:#EEEEEE, color:#000000
   classDef Class_01 fill:#E1BEE7
   classDef Sky stroke-width:1px, stroke-dasharray:none, stroke:#374D7C, fill:#E2EBFF, color:#374D7C
   classDef Pine stroke-width:1px, stroke-dasharray:none, stroke:#254336, fill:#27654A, color:#FFFFFF
   classDef Aqua stroke-width:1px, stroke-dasharray:none, stroke:#46EDC8, fill:#DEFFF8, color:#378E7A
   classDef Class_02 fill:#D50000
   classDef Class_03 fill:#C8E6C9
```

# Use-Case Diagrams:

![use-case](/diagram/use-case.png)
