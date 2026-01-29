import { error } from 'console';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface FileRecord {
    cid: string;
    file: string;
    uploadedTime: string;
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'htmls');
const STORAGE_FILE = path.join(process.cwd(), 'src', 'storage', 'filecoin_db.json');
const storageDir = path.dirname(STORAGE_FILE);

if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function loadStorage(): FileRecord[] {
    if (fs.existsSync(STORAGE_FILE)) {
        const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const records: FileRecord[] = JSON.parse(data);
        return records;
    }
    else {
        console.error("Doesn't exist storage file");
    }
    return [];
}

function saveStorage(records: FileRecord[]): void {
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(records, null, 2), 'utf-8');        
    } catch (error) {
        console.error('Error saving storage:', error);
    }
}

let fileRecords: FileRecord[] = loadStorage();

function generateCID(fileContent: string): string {
    const hash = crypto.createHash('sha256')
        .update(fileContent)
        .digest('hex');
    return `Qm${hash.substring(0, 44)}`;
}

function formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function storeFile(existingFilePath: string): {
    success: true;
    cid: string;
    filePath: string;
} {
    const fileContent = fs.readFileSync(existingFilePath, 'utf-8');
    const cid = generateCID(fileContent);
    const fileName = `${cid}.html`;
    const finalPath = path.join(UPLOADS_DIR, fileName);
    const relativePath = `uploads/htmls/${fileName}`;

    fs.renameSync(existingFilePath, finalPath);

    const fileRecord: FileRecord = {
        cid,
        file: relativePath,
        uploadedTime: formatDateTime(new Date())
    };

    const existingIndex = fileRecords.findIndex(r => r.cid === cid);
    if (existingIndex >= 0) {
        fileRecords[existingIndex] = fileRecord;
    } else {
        fileRecords.push(fileRecord);
    }

    // save to json
    saveStorage(fileRecords);
    return {
        success: true,
        cid,
        filePath: relativePath
    };
}

export function getFileByCID(cid: string): { cid: string; file: string; uploadedTime: string } | null {
    const record = fileRecords.find(r => r.cid === cid);
    if (!record) {
        return null;
    }

    const absolutePath = path.join(process.cwd(), record.file);
    if (!fs.existsSync(absolutePath)) {
        console.error(`File not found at path: ${absolutePath}`, error);
        return null;
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf-8');

    return {
        cid: record.cid,
        file: fileContent,
        uploadedTime: record.uploadedTime
    };
}

