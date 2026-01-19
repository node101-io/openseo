// API Service for OpenSEO Backend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface SearchResult {
  rank: number;
  id: string;
  cid: string;
  root: string;
  siteUrl: string;
  keywords: string[];
  totalScore: number;
  proof: string;
  verified: boolean;
  createdAt: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  count: number;
  results: SearchResult[];
  error?: string;
}

export interface VerifyResponse {
  success: boolean;
  verified: boolean;
  verifyTime?: number;
  totalTime?: number;
  message: string;
  error?: string;
}

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

// Verify proof
export async function verifyProof(
  proof: string,
  root: string
): Promise<VerifyResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/verify-proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ proof, root }),
    });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      verified: false,
      message: error.message || 'Verification failed',
    };
  }
}
