# OpenSEO 
The HTML Owner Service is the user-facing gateway of the OpenSEO platform. It allows users to upload their website's HTML content, generate Zero-Knowledge Proofs (ZKP), and submit verification requests to the blockchain and Data Availability (DA) layer.

# What the action does
1.Resolve HTML file – Picks the changed '.html' in target-folder(public)
2.Generate proof – Runs 'generate-proof.ts', writes 'output/proof-output.json'
3.Upload to Filecoin – Runs 'upload-filecoin.ts', writes 'output/cid.json'
4.Submit to Ethereum – Runs 'submit-request-eth.ts', reads 'output/cid.json' and proof
5.Submit to DA – Runs 'submit-proof-da.ts', reads proof, uses 'site-url'

CI: **generate proof** → **upload to Filecoin** → **submit request to Ethereum** → **submit proof to DA**.

# Configuration
OWNER_PRIVATE_KEY  
CONTRACT_ADDRESS  
ETHEREUM_RPC_URL  
FILECOIN_URL  
HTML_OWNER_PORT  
DA_URL  
HARDHAT_TEST_ACCOUNT  
WORKER_API_KEY  
TEST_HTML_PATH
TEST_KEYWORDS
TEST_SITE_URL

# Running the service
```bash
cd apps/github-action
pnpm run dev
```

# Use-Case Diagram
![use-case](/apps/github-action/diagram/use-case.png)
