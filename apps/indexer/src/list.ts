import fs from 'fs';
import path from 'path';

let cachedList: string[] | null = null;
function resolveListPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const normalized = path.normalize(filePath).replace(/^\.\//, '');
  const fromCwd = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromIndexer = path.resolve(process.cwd(), 'apps/indexer', normalized);
  if (fs.existsSync(fromIndexer)) return fromIndexer;
  return path.resolve(process.cwd(), filePath);
}

function loadList(): string[] {
  if (cachedList !== null) return cachedList;

  const filePath = process.env.INDEXER_LIST_FILE;
  if (filePath) {
    try {
      const absPath = resolveListPath(filePath);
      const content = fs.readFileSync(absPath, 'utf-8');
      cachedList = content
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
      return cachedList;
    } catch (e) {
      console.warn('[Indexer] List file not found or unreadable:', filePath);
    }
  }

  const envList = process.env.INDEXER_LIST;
  if (envList && typeof envList === 'string') {
    cachedList = envList
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    return cachedList;
  }

  cachedList = [];
  return cachedList;
}

export function getDomainFromUrl(siteUrl: string): string | null {
  try {
    const u = new URL(siteUrl);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// export function isListed(siteUrl: string): boolean {
//   const domain = getDomainFromUrl(siteUrl);
//   if (!domain) return true;

//   const list = loadList();
//   if (list.length === 0) return false;

//   const urlLower = siteUrl.toLowerCase();

//   for (const entry of list) {
//     if (domain === entry || domain.endsWith('.' + entry)) return true;
//     if (urlLower.includes(entry)) return true;
//   }

//   return false;
// }

export function hasListedKeyword(keywords: string[]): boolean {
  const list = loadList();
  if (list.length === 0) return false;

  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase();
    
    for (const entry of list) {
      if (kwLower.includes(entry)) {
        return true;
      }
    }
  }

  return false;
}