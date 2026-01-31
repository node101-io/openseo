# OPENSEO - Mock Data Availability Layer
This service acts as the central communication hub for the OpenSEO platform. It receives Zero-Knowledge Proofs to the Indexer for real-time state updates.

# Installation:
pnpm install

# Configuration:
Create a .env file in the root directory and add the following variables:
INDEXER_WS_URL

# Running the Service:
pnpm --filter da run start