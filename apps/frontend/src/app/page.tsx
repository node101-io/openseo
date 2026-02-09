'use client';
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { SearchInput } from '../components/search-input';
import { searchByKeyword, SearchResult, type IndexerMode } from '../pages/api';
import { verifyProofClientSide } from './proof-component';
import { setStoredVerified, hashResult } from '../components/result-card';

const ResultCard = dynamic(
  () => import('../components/result-card').then(mod => ({ default: mod.ResultCard })),
  { ssr: false }
);

export default function Home() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyAllEnabled, setVerifyAllEnabled] = useState(false);
  const [verifyAllInProgress, setVerifyAllInProgress] = useState(false);
  const [verifyAllResults, setVerifyAllResults] = useState<Record<string, '1' | '0'>>({});
  const [indexerMode, setIndexerMode] = useState<IndexerMode>('safe');

  const handleSearch = async (query: string, modeOverride?: IndexerMode) => {
    const mode = modeOverride ?? indexerMode;
    setIsLoading(true);
    setError(null);
    setVerifyAllEnabled(false);
    setVerifyAllResults({});
    setSearchQuery(query);
    setHasSearched(true);
    if (modeOverride !== undefined) setIndexerMode(mode);

    const response = await searchByKeyword(query, mode);

    if (response.success) {
      setResults(response.results);
    } else {
      setError(response.error || 'Search failed');
      setResults([]);
    }

    setIsLoading(false);
  };

  const handleVerifyAllToggle = useCallback(async (enabled: boolean) => {
    setVerifyAllEnabled(enabled);
    if (!enabled) {
      setVerifyAllResults({});
      return;
    }
    if (results.length === 0) return;
    setVerifyAllInProgress(true);
    setVerifyAllResults({});
    const next: Record<string, '1' | '0'> = {};
    for (const result of results) {
      const hash = await hashResult(result);
      try {
        const response = await verifyProofClientSide(result.proof, result.root);
        const status = response.verified ? 1 : 0;
        next[result.cid] = status ? '1' : '0';
        setStoredVerified(hash, status);
      } catch {
        next[result.cid] = '0';
        setStoredVerified(hash, 0);
      }
      setVerifyAllResults(prev => ({ ...prev, ...next }));
    }
    setVerifyAllInProgress(false);
  }, [results]);

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
          <div className="flex items-center gap-2">
            <label htmlFor="indexer-mode" className="text-sm text-gray-600 sr-only">
              Indexer
            </label>
            <select
              id="indexer-mode"
              value={indexerMode}
              onChange={(e) => {
                const mode = e.target.value as IndexerMode;
                if (hasSearched && searchQuery.trim()) {
                  handleSearch(searchQuery, mode);
                } else {
                  setIndexerMode(mode);
                }
              }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <option value="safe">Safe</option>
              <option value="dark">Danger</option>
            </select>
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
              {/* Results header: left = count, right = Verify all toggle */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
                {results.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-sm text-gray-600">Verify All</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={verifyAllEnabled}
                      disabled={verifyAllInProgress}
                      onClick={() => handleVerifyAllToggle(!verifyAllEnabled)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 ${
                        verifyAllEnabled ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          verifyAllEnabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    {verifyAllInProgress && (
                      <span className="text-xs text-gray-500">Verifying…</span>
                    )}
                  </label>
                )}
              </div>

              {/* Results list */}
              {results.length > 0 ? (
                <div className="space-y-4">
                  {results.map((result, index) => (
                    <ResultCard
                      key={result.cid}
                      result={result}
                      index={index}
                      verifyAllResult={verifyAllResults[result.cid] ?? null}
                      verifyAllInProgress={verifyAllInProgress}
                    />
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