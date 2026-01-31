# OpenSEO Indexer
The indexer service stores and queries ZK proof metadata for the OpenSEO ecosystem. It receives proofs from the DA layer, verifies them against the chain and the ZK verifier, and persists records in MongoDB. You can run **two indexer instances**: one **family-friendly (safe)** and one **dark**; each has its own blacklist and MongoDB collection.

## Purpose
When a site is submitted and its proof is broadcast from the DA service, the indexer checks that the root exists on Ethereum and that the ZK proof is valid. Before saving, it checks the site’s domain against its blacklist: if the domain matches the blacklist, the site is rejected. Otherwise the record is stored. The frontend uses the indexer’s `/search` and `/verify-proof` endpoints.

## Two indexers (safe vs dark)
- **Safe indexer**: blacklist is (`blacklist-safe.example.txt`) so dark sites are **rejected**; only family-friendly sites go to `openseo_safe`.
- **Dark indexer**: blacklist is (`blacklist-dark.example.txt`) so .onion and dark sites are stored in `openseo_dark`.

The **DA layer** broadcasts every proof to both indexers. Each indexer decides (via its own blacklist) whether to store or reject, and writes only to its own MongoDB database(`openseo_safe` vs `openseo_dark`), so results never mix: e.g. onion.com appears only in the dark indexer and only in the dark DB.

## Running
```bash
pnpm --filter indexer dev
```

Or run separately:
```bash
pnpm -C apps/indexer run dev:safe   # openseo_safe, port 3008
pnpm -C apps/indexer run dev:dark   # openseo_dark, port 3012
```

## Installation
pnpm install

## Configuration
| Env | Description |
|-----|-------------|
| `INDEXER_PORT` | HTTP server port (default 3008) |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DATABASE` | Database name (e.g. `openseo_safe` / `openseo_dark`); each indexer uses its own DB |
| `INDEXER_COLLECTION` | Collection name (default `proofs`) |
| `DA_WS_URL` | DA WebSocket URL to receive broadcasts (e.g. `ws://localhost:3011`) |
| `INDEXER_BLACKLIST` | Comma-separated domains/substrings to reject (e.g. `adult,drugs,.onion`) |
| `INDEXER_BLACKLIST_FILE` | Path to file: one domain or substring per line; `#` = comment |
| `ETHEREUM_RPC_URL` | Ethereum RPC URL |
| `CONTRACT_ADDRESS` | OpenSEO contract address |