# OpenSEO

The HTML Owner Service is the user-facing gateway of the OpenSEO platform. It allows users to upload their website's HTML content, generate Zero-Knowledge Proofs (ZKP), and submit verification requests to the blockchain and Data Availability (DA) layer.

## What the action does

1.Resolve HTML file – Picks the changed '.html' in target-folder(public)
2.Generate proof – Runs 'generate-proof.ts', writes 'output/proof-output.json'
3.Upload to Filecoin – Runs 'upload-filecoin.ts', writes 'output/cid.json'
4.Submit to Solana – Runs 'submit-request-solana.ts', reads 'output/cid.json' and proof
5.Submit to DA – Runs 'submit-proof-da.ts', reads proof, uses 'site-url'

CI: **generate proof** → **upload to Filecoin** → **submit request to Solana** → **submit proof to DA**.

## Configuration

KEYPAIR_PATH  
PROGRAM_ID  
SOLANA_RPC_URL  
FILECOIN_URL  
HTML_OWNER_PORT  
DA_URL  
WORKER_API_KEY  
TEST_HTML_PATH
TEST_KEYWORDS
TEST_SITE_URL

## Running the service

```bash
pnpm --filter github-action dev
```

## Use-Case Diagram

![use-case](/apps/github-action/diagram/use-case.png)
