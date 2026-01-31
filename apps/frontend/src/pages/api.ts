import type { SearchResult, SearchResponse } from '@openseo/types';

const INDEXER_URL_SAFE = 'http://localhost:3008';
const INDEXER_URL_DARK = 'http://localhost:3012';

export type IndexerMode = 'safe' | 'dark';
export type { SearchResult, SearchResponse } from '@openseo/types';

export function getIndexerBaseUrl(mode: IndexerMode): string {
  return mode === 'dark' ? INDEXER_URL_DARK : INDEXER_URL_SAFE;
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