# OPENSEO - Mock Data Availability Layer
This service acts as the central communication hub for the OpenSEO platform. It receives Zero-Knowledge Proofs to the Indexer for real-time state updates.

## Setup
1. **KV namespace:** `npx wrangler kv:namespace create DA_KV`  
   Please write this id in wrangler.toml

2. **Deploy:**
   ```bash
   pnpm install
   pnpm run deploy
   ```

## Local testing

```bash
cd apps/worker-da
pnpm install
pnpm run dev
```

### Env before deploy
- Backend: `DA_URL=http://localhost:8787`
- Indexer: `DA_WS_URL=ws://localhost:8787/ws`

## Env after deploy
- **Backend:** `DA_URL` = `https://<worker-da>.workers.dev`
- **Indexer:** `DA_WS_URL` = `wss://<worker-da>.workers.dev/ws`