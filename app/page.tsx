'use client';

import { useState } from 'react';
import { SearchInput } from '@/components/SearchInput';
import { ResultCard } from '@/components/ResultCard';
import { searchByKeyword, SearchResult } from '@/app/api';

export default function Home() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setError(null);
    setSearchQuery(query);
    setHasSearched(true);

    const response = await searchByKeyword(query);

    if (response.success) {
      setResults(response.results);
    } else {
      setError(response.error || 'Search failed');
      setResults([]);
    }

    setIsLoading(false);
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="py-6 px-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/openseo.jpeg" alt="OpenSEO Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">OpenSEO</h1>
              <p className="text-xs text-gray-500">Decentralized Search</p>
            </div>
          </div>
        </div>
      </header>

      {/* Search */}
      <section className={`transition-all duration-500 ${hasSearched ? 'py-8' : 'py-20'}`}>
        <div className="max-w-5xl mx-auto px-4">
          {!hasSearched && (
            <div className="text-center mb-10 fade-in">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Search the Decentralized Web
              </h2>
              <p className="text-lg text-gray-600 max-w-xl mx-auto">
                Find verified websites with zero-knowledge proofs. 
                Results are ranked by SEO score and cryptographically verifiable.
              </p>
            </div>
          )}

          <SearchInput onSearch={handleSearch} isLoading={isLoading} />
        </div>
      </section>

      {/* Results */}
      <section className="pb-20">
        <div className="max-w-3xl mx-auto px-4">
          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg className="h-10 w-10 text-primary-500 spinner" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <p className="mt-4 text-gray-500">Searching...</p>
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Search Error</h3>
              <p className="text-gray-500">{error}</p>
            </div>
          )}

          {/* Results */}
          {!isLoading && !error && hasSearched && (
            <>
              {/* Results */}
              <div className="mb-6">
                <p className="text-sm text-gray-500">
                  {results.length > 0 ? (
                    <>
                      Found <span className="font-semibold text-gray-700">{results.length}</span> results 
                      for &quot;<span className="font-semibold text-gray-700">{searchQuery}</span>&quot;
                    </>
                  ) : (
                    <>
                      No results found for &quot;<span className="font-semibold text-gray-700">{searchQuery}</span>&quot;
                    </>
                  )}
                </p>
              </div>

              {/* Results list */}
              {results.length > 0 ? (
                <div className="space-y-4">
                  {results.map((result, index) => (
                    <ResultCard key={result.cid} result={result} index={index} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Results</h3>
                  <p className="text-gray-500">Try searching with different keywords</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>OpenSEO - Decentralized Search with Zero-Knowledge Proofs</p>
        </div>
      </footer>
    </main>
  );
}
