# OpenSEO Contract

The OpenSEO smart contract is the on-chain component that coordinates verification requests and stores consensus results. It acts as the source of truth for all verified HTML roots.

## Primary Functions

- **Verification Request Management**

  Website owners submit verification requests by providing a content identifier (CID) and a list of keywords they want to prove exist in their HTML. A fee is required to incentivize node operators to perform the verification.

- **Consensus Mechanism**

  Multiple verification nodes independently compute the HTML root for a given CID and submit their results to the contract. The contract tracks votes and determines consensus when a threshold of nodes agree on the same root value.

- **Result Storage**

  Once consensus is reached, the agreed-upon HTML root is permanently stored on-chain. This root can be used by anyone to verify that a specific HTML document contains certain keywords with a specific SEO score.

- **Timeout and Refund Handling**

  If verification nodes fail to reach consensus within the timeout period, the original requester can claim a refund. This protects users from losing funds due to network issues or node unavailability.

## Purpose

The smart contract serves as the trust anchor for the entire system. While the backend services handle computation and storage, the contract provides the cryptographic guarantee that verification results cannot be tampered with after consensus is reached.

By storing only the HTML root (a 32-byte hash) rather than the full content, the contract maintains minimal on-chain footprint while still enabling full verification. Anyone with access to the original HTML can recompute the root and verify it matches the on-chain value.

The contract is designed to be node-operator agnostic. Any entity can run a verification node and participate in consensus, provided they stake the required amount and follow the protocol.

## Deployment

```bash
# Compile the contract
pnpm compile

# Deploy to local Hardhat node
pnpm deploy:localhost

# Deploy to Sepolia testnet
pnpm deploy:sepolia
```

## Usage

This package is exported as `@openseo/contract` for use by other packages:

```typescript
import { getOpenSEOABI } from '@openseo/contract';
```
