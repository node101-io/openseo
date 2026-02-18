import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getOpenSEOABI(): any[] {
    const artifactPath = path.resolve(__dirname, '..', '..', 'openseo.json');
    
    console.log(`Loading contract ABI from: ${artifactPath}`);
    
    if (!fs.existsSync(artifactPath)) {
        throw new Error(
            `Contract artifact not found at: ${artifactPath}`
        );
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    return artifact.abi;
}
