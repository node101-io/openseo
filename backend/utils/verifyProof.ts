import childProcess from 'node:child_process';

export interface ProofVerificationResult {
  html_hash: string,
  merkle_root: string
};

export default async function verifyProof(proof: string): Promise<ProofVerificationResult | Error> {
  const proofVerificationResult = await new Promise((resolve) => {
    childProcess.exec(`${process.env.BINARY_PATH} ${proof}`, (error, stdout, stderr) => {
      if (error)
        return resolve(new Error('failed_to_verify_proof', { cause: error.message }));

      if (stderr)
        return resolve(new Error('failed_to_verify_proof', { cause: stderr }));

      const { html_hash, merkle_root } = JSON.parse(stdout);

      return resolve({ html_hash, merkle_root });
    });
  });

  if (proofVerificationResult instanceof Error)
    return proofVerificationResult;

  return proofVerificationResult as ProofVerificationResult;
};
