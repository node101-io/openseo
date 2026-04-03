import type { SearchResponse } from '@openseo/types';

export type IndexerMode = 
  | 'safe' 
  | 'danger' 
  | 'family-friendly' 
  | 'general' 
  | 'english' 
  | 'blockchain';

const FILECOIN_URL =  'https://openseo-filecoin.openseo.workers.dev';

export type { SearchResult, SearchResponse } from '@openseo/types';

const LOCAL_PORTS: Record<IndexerMode, number> = {
  'safe': 3008,
  'danger': 3012,
  'family-friendly': 3032,
  'general': 3033, 
  'english': 3034,
  'blockchain': 3035 
};

export function getIndexerBaseUrl(mode: IndexerMode): string {
  //return `http://localhost:${LOCAL_PORTS[mode]}`;
  return `https://indexer.openseo.info/${mode}`;
}
export async function fetchAvailableKeywords(
  mode: IndexerMode,
): Promise<string[]> {
  try {
    const baseUrl = getIndexerBaseUrl(mode);
    const response = await fetch(`${baseUrl}/suggestions`);
    const data = await response.json();

    if (data.success) {
      return data.keywords.map((keyword: string) => keyword.toLowerCase());
    }
    return [];
  } catch (error) {
    console.error("Fetch keywords error:", error);
    return [];
  }
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