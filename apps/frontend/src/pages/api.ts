import type { SearchResult, SearchResponse } from '@openseo/types';

const INDEXER_URL_SAFE = 'http://91.99.175.202/safe';
const INDEXER_URL_DANGER = 'http://91.99.175.202/danger';
const FILECOIN_URL =  'https://openseo-filecoin.openseo.workers.dev';

export type IndexerMode = 'safe' | 'danger';
export type { SearchResult, SearchResponse } from '@openseo/types';

export function getIndexerBaseUrl(mode: IndexerMode): string {
  return mode === 'danger' ? INDEXER_URL_DANGER : INDEXER_URL_SAFE;
}

export async function searchByKeyword(query: string, indexerMode: IndexerMode = 'safe'): Promise<SearchResponse> {
  const baseUrl = getIndexerBaseUrl(indexerMode);
  try {
    const response = await fetch(
      `${baseUrl}/search?query=${encodeURIComponent(query)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      query,
      count: 0,
      results: [],
      error: error.message || 'Search failed',
    };
  }
}

export async function getFilecoinList(): Promise<{ success: boolean; cids?: string[]; error?: string }> {
  try {
    const res = await fetch(`${FILECOIN_URL}/list`);
    const data = await res.json();
    if (data.success && Array.isArray(data.cids)) return { success: true, cids: data.cids };
    return { success: false, error: data.error || 'Failed to list' };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to list' };
  }
}

export async function getFilecoinHtml(cid: string): Promise<{ success: boolean; file?: string; error?: string }> {
  try {
    const res = await fetch(`${FILECOIN_URL}/html_file/${encodeURIComponent(cid)}`);
    const data = await res.json();
    if (data.success && data.file != null) return { success: true, file: data.file };
    return { success: false, error: data.error || 'Not found' };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to load' };
  }
}