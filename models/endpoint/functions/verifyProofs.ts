import { Proof } from '../Endpoint';

async function isMerkleRootVerified(merkle_root: string, html_hash: string): Promise<true | Error> {
  // Simulate a verification process

  return new Promise((resolve) => {
    setTimeout(() => {
      if (merkle_root === html_hash) {
        resolve(true);
      } else {
        resolve(new Error('Merkle root verification failed'));
      }
    }, 1000);
  });
};

async function isProofVerified(content: object): Promise<true | Error> {
  // Simulate a verification process

  return new Promise((resolve) => {
    setTimeout(() => {
      if (content && typeof content === 'object') {
        resolve(true);
      } else {
        resolve(new Error('Proof verification failed'));
      }
    }, 1000);
  });
};

async function isHTMLHashMatched(merkle_root: string, html_hash: string): Promise<true | Error> {
  // Simulate a verification process

  return new Promise((resolve) => {
    setTimeout(() => {
      if (merkle_root === html_hash) {
        resolve(true);
      } else {
        resolve(new Error('HTML hash mismatch'));
      }
    }, 1000);
  });
};

export default async function verifyProofs(proof: Proof): Promise<true | Error> {
  const { content, merkle_root, html_hash } = proof;

  const merkleCheckResult = await isMerkleRootVerified(merkle_root, html_hash);
  if (merkleCheckResult instanceof Error)
    return merkleCheckResult;

  const proofCheckResult = await isProofVerified(content);
  if (proofCheckResult instanceof Error)
    return proofCheckResult;

  const hashCheckResult = await isHTMLHashMatched(merkle_root, html_hash);
  if (hashCheckResult instanceof Error)
    return hashCheckResult;

  return true;
};
