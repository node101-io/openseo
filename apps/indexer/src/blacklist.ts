import fs from 'fs';
import path from 'path';

let cachedBlacklist: string[] | null = null;

function resolveBlacklistPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const normalized = path.normalize(filePath).replace(/^\.\//, '');
  const fromCwd = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromIndexer = path.resolve(process.cwd(), 'apps/indexer', normalized);
  if (fs.existsSync(fromIndexer)) return fromIndexer;
  return path.resolve(process.cwd(), filePath);
}

function loadBlacklist(): string[] {
  if (cachedBlacklist !== null) return cachedBlacklist;

  const filePath = process.env.INDEXER_BLACKLIST_FILE;
  if (filePath) {
    try {
      const absPath = resolveBlacklistPath(filePath);
      const content = fs.readFileSync(absPath, 'utf-8');
      cachedBlacklist = content
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
      return cachedBlacklist;
    } catch (e) {
      console.warn('[Indexer] Blacklist file not found or unreadable:', filePath);
    }
  }

  const envList = process.env.INDEXER_BLACKLIST;
  if (envList && typeof envList === 'string') {
    cachedBlacklist = envList
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    return cachedBlacklist;
  }

  cachedBlacklist = [];
  return cachedBlacklist;
}

export function getDomainFromUrl(siteUrl: string): string | null {
  try {
    const u = new URL(siteUrl);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isBlacklisted(siteUrl: string): boolean {
  const domain = getDomainFromUrl(siteUrl);
  if (!domain) return true;

  const blacklist = loadBlacklist();
  if (blacklist.length === 0) return false;

  const urlLower = siteUrl.toLowerCase();

  for (const entry of blacklist) {
    if (domain === entry || domain.endsWith('.' + entry)) return true;
    if (urlLower.includes(entry)) return true;
  }

  return false;
}
