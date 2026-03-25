# OpenSEO Contract

The OpenSEO contract package provides the Solana smart contract and Node.js utilities for deployment and IDL access. The contract is the on-chain source of truth for verified HTML roots and coordinates verification requests and consensus among nodes.

## Purpose

The smart contract anchors trust for the system. Website owners submit a CID and keywords and pay a fee; authorized nodes compute the HTML root and vote. When enough nodes agree on the same root, it is stored on-chain. The indexer and other services use this package to read the contract (IDL) and deploy it to a network.

## Features

- **Verification requests**  
  `submitRequest(cid, keywords)` — requester pays and emits a request. Only one active request per CID.

- **Node voting**  
  Authorized nodes call `submit_html_root(cid, htmlRoot)`. Votes are grouped by root; when `REQUIRED_CONSENSUS` (2) nodes agree on the same root, the request is finalized.

- **Result storage**  
  Finalized `(cid, resultRoot)` is stored in `results`. Anyone can read the agreed root for a CID.

- **Payouts**  
  When consensus is reached, the payment is split among the nodes that voted for the winning root.

- **Timeout and refund**  
  If the request is not processed within `VERIFICATION_TIMEOUT`, the owner can claim a refund.

## Usage

This package is consumed as `@openseo/contracts` by the backend, indexer, and nodes. Import the IDL and deploy helpers:

## Running (contract package only)

From the monorepo root:

```bash
pnpm --filter @openseo/contracts compile
pnpm --filter @openseo/contracts deploy:local
pnpm --filter @openseo/contracts deploy:devnet
```
