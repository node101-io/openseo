# OpenSEO Contract

The OpenSEO contract package provides the Solana smart contract and Node.js utilities for deployment and IDL access. The contract is the on-chain source of truth for verified HTML roots and coordinates verification requests and consensus among nodes.

## Purpose

The smart contract anchors trust for the system. Website owners submit a CID and keywords and pay a fee; authorized nodes compute the HTML root and vote. When enough nodes agree on the same root, it is stored on-chain. The indexer and other services use this package to read the contract (IDL) and deploy it to a network.

## Features

- **Verification requests** `submitRequest(cid, cid_str, keywords)` — requester pays and emits a request. Only one active request per CID.

- **Node voting** Authorized nodes call `submit_html_root(cid, htmlRoot)`. Votes are grouped by root; when `REQUIRED_CONSENSUS` (2) nodes agree on the same root, the request is finalized.

- **Result storage** Finalized `(cid, resultRoot)` is stored on-chain. Anyone can read the agreed root for a CID.

- **Payouts** When consensus is reached, the payment is split among the nodes that voted for the winning root.

- **Timeout and refund** If the request is not processed within `VERIFICATION_TIMEOUT`, the owner can claim a refund.

## Node Setup & Keypair Generation

To authorize nodes in the smart contract, you must generate local Solana keypairs for them. These keypairs should be securely stored in the `pubkeys` directory.

1. Create the directory (if it doesn't exist) and generate the keypairs:

```bash
mkdir -p packages/contracts/pubkeys
solana-keygen new --outfile packages/contracts/pubkeys/node1.json --no-bip39-passphrase
solana-keygen new --outfile packages/contracts/pubkeys/node2.json --no-bip39-passphrase
solana-keygen new --outfile packages/contracts/pubkeys/node3.json --no-bip39-passphrase
```

2. Retrieve the public keys for each generated node:

```bash
solana-keygen pubkey packages/contracts/pubkeys/node1.json
solana-keygen pubkey packages/contracts/pubkeys/node2.json
solana-keygen pubkey packages/contracts/pubkeys/node3.json
```

**Funding Node Addresses**

Each node requires a SOL balance on the network to pay for transaction fees when submitting ZK proofs and voting. Before deploying or running the nodes on Devnet, you must fund their addresses.
Request a Devnet airdrop for each node's public key:

```bash
solana airdrop 2 <NODE_1_PUBKEY> --url devnet
solana airdrop 2 <NODE_2_PUBKEY> --url devnet
solana airdrop 2 <NODE_3_PUBKEY> --url devnet
```

**Note**:You can verify balance for each node
You can verify the balance of any node at any time using:

```bash
solana balance <NODE_PUBKEY> --url devnet
```

## Deployment & Running

**Devnet Deployment**

1. Build the contract

```bash
anchor builld
```

2. Deploy the contract to devnet:

```bash
anchor deploy --provider.cluster devnet
```

**Localnet Deployment**

1. Start the Local Validator
   Open a new terminal window and run the Solana test validator. **Keep this terminal open** as long as you are developing:

```bash
solana-test-validator
```

2. Configure Solana CLI to Localhost
   Open another terminal and point your Solana CLI to your local network:

```bash
solana config set --url localhost
```

3. Fund the Nodes

```bash
solana airdrop 100 <NODE_1_PUBKEY>
solana airdrop 100 <NODE_2_PUBKEY>
solana airdrop 100 <NODE_3_PUBKEY>
```

4. Build the contract

```bash
anchor builld
```

5. Deploy the contract to localnet:

```bash
anchor deploy --provider.cluster localnet
```

**Important:**

- When you run Localnet, a folder named `test-ledger` is created on your computer.
- When switching between localnet and devnet, make sure to update the RPC_URL in your .env files across your backend, indexer, and oracle-nodes (SOLANA_RPC_URL= https://api.devnet.solana.com to http://127.0.0.1:8899).

## Running (contract package only)

From the monorepo root:
pnpm --filter @openseo/contracts compile
pnpm --filter @openseo/contracts deploy:local
pnpm --filter @openseo/contracts deploy:devnet
