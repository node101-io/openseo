import fs from 'fs';
import { FILECOIN_URL, workerHeaders } from './config';

type ResponseData = { cid?: string; error?: string };

export async function uploadToFilecoin(htmlContent: string): Promise<string> {
    const res = await fetch(`${FILECOIN_URL}/send_file`, {
        method: 'POST',
        headers: workerHeaders(),
        body: JSON.stringify({ file: htmlContent }),
    });
    const json = await res.json().catch(() => ({}));
    const data: ResponseData = json;

    if (!res.ok) {
        throw new Error(data?.error || `Filecoin upload failed: ${res.status}`);
    }
    if (!data?.cid) {
        throw new Error(data?.error || 'No CID');
    }
    return String(data.cid);
}

const OUTPUT_DIR = 'output';
const CID_FILE = `${OUTPUT_DIR}/cid.json`;

async function main() {
    const path = process.env.TEST_HTML_PATH;
    if (!path) {
        console.error('Usage: tsx upload-filecoin.ts <path>');
        process.exit(1);
    }
    const htmlContent = fs.readFileSync(path, 'utf-8');
    const cid = await uploadToFilecoin(htmlContent);
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(CID_FILE, JSON.stringify({ cid }, null, 2));
}

const run = process.argv[1]?.includes('upload-filecoin');
if (run) {
    main().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
