# OpenSeo

## Project Purpose

OpenSeo transforms the traditional SEO landscape by decentralizing the verification process. Instead of relying on centralized authorities, our system leverages cryptographic proofs to provide transparent and verifiable SEO metrics. Static website owners generate an SP1 proof from their HTML content that confirms the frequency and significance of specific keywords using a specialized algorithm (which scores keywords based on their occurrence count and the significance of the HTML tags in which they appear—for example, keywords in `<title>`, `<h1>`, or `<meta>` tags may be weighted more heavily compared to those in `<p>` tags). The resulting proof—including the HTML hash and the Merkle root of keyword scores—is submitted to our backend for storage, verification, and subsequent query responses.

## Architecture Overview

OpenSeo is built around four integral components: Static Website Owners, the Backend System, an integrated Data Availability Layer, and the prover network **Succinct**. This comprehensive architecture ensures that proof generation, verification, and data dissemination are secure, efficient, and scalable.

### 1. Static Website Owners (Proof Generation)

- **HTML Content Analysis & Keyword Extraction:**  
  Website owners parse their site's HTML content to extract relevant data, particularly focusing on the `<meta>` tags to obtain the `keywords` field.

- **Keyword Scoring:**  
  A scoring algorithm evaluates each extracted keyword based on its frequency and the significance of the tags in which it appears  
  *(e.g., keywords in `<title>`, `<h1>`, or `<meta>` tags may receive higher scores than those in `<p>` tags)*. The process involves:
  - **Hashing Each Score:** Each keyword score is hashed.

- **Merkle Tree Construction & SP1 Proof Generation:**  
  Hashed keyword scores are assembled into a Merkle Tree:
  1. Each leaf node represents a hashed keyword score.
  2. Internal nodes are computed by concatenating and hashing the child nodes.
  3. The final Merkle root is derived from the tree structure.  
  Using the complete HTML content as input, the SP1 proof is generated, yielding:
  - **HTML Hash:** Included in the proof, this allows verifiers to confirm which private HTML content was used.
  - **Merkle Root:** A condensed representation of the aggregated keyword scores.

### 2. Backend System

- **Proof Submission & Storage:**  
  Website owners submit their generated SP1 proof, along with the corresponding website URL, to OpenSeo’s backend. The system securely stores these proofs in a database.

- **Backend Verification Process:**  
  Upon submission, the backend:
  - Verifies the SP1 proof.
  - Computes the hash of the HTML fetched from the provided URL and compares it with the HTML hash in the proof.
  - Aborts if the verification fails, ensuring that only valid proofs are accepted.

- **Query Handling & Witness Generation:**  
  The backend accepts search queries using:
  - A mandatory `keywords` parameter.
  - An optional `min_score` parameter (defaulting to, for example, 50) to filter out results below a certain threshold.
  - For each valid query, the system computes a Merkle witness (with logarithmic complexity `O(log n)`) for the queried keyword, enabling users to independently verify the associated proof data.

### 3. Data Availability Layer

- **Registration & Data Dissemination:**  
  While our architecture includes a Data Availability (DA) Layer to ensure that all proof submissions and associated metadata are widely disseminated for transparency and redundancy, in the initial deployment, proof submissions will be sent directly to the backend (making the system permissioned). In the future, we plan to integrate an external DA layer using solutions such as EigenDA, Celestia, or Avail. Once integrated, the external DA layer will naturally operate in a permissionless manner, further decentralizing the ecosystem.

### 4. Prover Network: Succinct

- **Integrated Proof Automation:**  
  OpenSeo relies on the built-in prover network, **Succinct**, to automate and streamline proof generation. Website owners can integrate Succinct into their CI/CD pipelines, ensuring that proofs are generated continuously and autonomously.
  
  *An example pipeline code snippet will be provided to demonstrate this integration.*

- **Enhanced Security & Scalability:**  
  By automating proof generation with Succinct, the process becomes both distributed and highly scalable. This integration not only improves performance under heavy loads but also reinforces the system’s security by eliminating potential manual errors.

## Workflow Summary

1. **Proof Generation**
   - The website owner processes HTML content to extract and score keywords.
   - Hashed keyword scores, sorted alphabetically, are structured into a Merkle Tree.
   - The SP1 proof is generated, outputting the HTML hash and the Merkle root.

2. **Submission & Storage**
   - The SP1 proof and website URL are submitted via the system (initially directly to the backend).
   - The backend verifies the proof by fetching the website’s HTML and comparing its hash with the proof’s HTML hash. Valid proofs are then stored.

3. **Verification During Query**
   - When a user queries the system with the appropriate `keywords` and optional `min_score` parameters, the backend retrieves matching proofs.
   - A Merkle witness is generated for the queried keyword.
   - The system returns a complete verification package that includes both the SP1 proof and the witness.

4. **Result Presentation & Independent Verification**
   - Users receive the verification package, allowing them to independently validate the SEO claims using cryptographic methods.

## Value Proposition

- **Transparency:**  
  Website owners provide verifiable cryptographic evidence of their SEO performance, ensuring complete transparency.

- **Verifiability:**  
  Merkle Trees and SP1 proofs guarantee that every keyword score is securely hashed and independently verifiable, safeguarding against manipulation.

- **Decentralization:**  
  OpenSeo eliminates the need for centralized SEO authorities by leveraging a distributed architecture, an integrated Data Availability Layer, and the Succinct prover network.

- **Automation & Scalability:**  
  Integration with the Succinct network automates proof generation, while the future DA layer (via external solutions) will ensure that registration data is widely available and robustly supported. This creates a scalable and high-performance system even under heavy usage.

- **Permissioned to Permissionless Transition:**  
  Initially, data dissemination will be permissioned for secure deployment, but as we integrate external DA solutions, the system will evolve into a fully permissionless ecosystem, fostering complete decentralization.

## Conclusion

OpenSeo offers a novel approach to SEO verification by harnessing the power of cryptographic proofs. With an integrated framework that includes the Succinct prover network and a robust Data Availability Layer (leveraging external solutions such as EigenDA, Celestia, or Avail), OpenSeo delivers a scalable, transparent, and reliable solution for modern SEO challenges. This architecture not only instills trust and accountability in SEO metrics but also paves the way for the future of decentralized digital marketing.
