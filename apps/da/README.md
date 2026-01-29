# OPENSEO - Data Availability Layer

This service acts as the central communication hub for the OpenSEO platform. It receives Zero-Knowledge Proofs to the Indexer for real-time state updates.


# Installation:
Install the required dependencies:
pnpm install


# Configuration:
Create a .env file in the root directory and add the following variables:
DA_PORT
INDEXER_WS_URL
INDEXER_WS_PORT


# Running:
pnpm start
# or from the root directory
pnpm --filter da run start