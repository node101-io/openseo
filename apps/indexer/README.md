# OpenSEO Indexer

The indexer service stores and queries ZK proof metadata for the OpenSEO ecosystem. It receives proofs from the DA layer, verifies them against the chain and the ZK verifier, and persists records in MongoDB. You can run **two indexer instances**: one **family-friendly (safe)** and one **danger**; each has its own blacklist and MongoDB collection.

## Purpose

When a site is submitted and its proof is broadcast from the DA service, the indexer checks that the root exists on Ethereum and that the ZK proof is valid. Before saving, it checks the site’s domain against its blacklist: if the domain matches the blacklist, the site is rejected. Otherwise the record is stored. The frontend uses the indexer’s `/search` and `/verify-proof` endpoints.

## Two indexers (safe vs danger)

- **Safe indexer**: blacklist is (`blacklist-safe.example.txt`) so danger sites are **rejected**; only family-friendly sites go to `openseo_safe`.
- **Danger indexer**: blacklist is (`blacklist-danger.example.txt`) so .onion and danger sites are stored in `openseo_danger`.

The **DA layer** broadcasts every proof to both indexers. Each indexer decides (via its own blacklist) whether to store or reject, and writes only to its own MongoDB database(`openseo_safe` vs `openseo_danger`), so results never mix: e.g. onion.com appears only in the danger indexer and only in the danger DB.

## Running

```bash
pnpm --filter indexer dev
```

x
Or run separately:

```bash
pnpm -C apps/indexer run dev:safe
pnpm -C apps/indexer run dev:danger
```

## Installation

```bash
pnpm install
```

## Configuration

- MONGODB_URI: MongoDB connection string
- CONTRACT_ADDRESS: OpenSEO contract address.
- ETHEREUM_RPC_URL: Ethereum RPC URL. Indexer looks up root→CID from contract events.

## Use-Case Diagram:

Proof Web Site:

![use-case](/apps/indexer/diagram/use-case-proof.png)

Search Process:

![use-case](/apps/indexer/diagram/use-case-process.png)
