import fs from 'fs';
import path from 'path';

export function loadContractABI(contractName: string): any[] {
    const artifactPath = path.join(
        process.cwd(),
        `${contractName}.json`
    );
    console.log(`Loading contract ABI from: ${artifactPath}`);

    if (!fs.existsSync(artifactPath)) {
        throw new Error(
            `Contract artifact not found at: ${artifactPath}\n`
        );
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    return artifact.abi;
}

export function getOpenSEOABI(): any[] {
    return loadContractABI('openseo');
}
