import type { SearchResult, SearchResponse } from '@openseo/types';

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3008';
const API_BASE_URL = INDEXER_URL;

export type { SearchResult, SearchResponse } from '@openseo/types';

export async function searchByKeyword(query: string): Promise<SearchResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/search?query=${encodeURIComponent(query)}`,
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