"use client";
import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { SearchInput } from "../components/search-input";
import {
  fetchAvailableKeywords,
  searchByKeyword,
  SearchResult,
  type IndexerMode,
} from "../services/api";
import { verifyProofClientSide } from "./proof-component";
import { setStoredVerified, hashResult } from "../components/result-card";

const ResultCard = dynamic(
  () =>
    import("../components/result-card").then((mod) => ({
      default: mod.ResultCard,
    })),
  { ssr: false },
);

export default function Home() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyAllEnabled, setVerifyAllEnabled] = useState(true);
  const [verifyAllInProgress, setVerifyAllInProgress] = useState(false);
  const [verifyAllResults, setVerifyAllResults] = useState<
    Record<string, "1" | "0">
  >({});
  const [indexerMode, setIndexerMode] = useState<IndexerMode>("general");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const storedPref = localStorage.getItem("autoVerify");

    if (storedPref === "false") {
      setVerifyAllEnabled(false);
    } else if (storedPref === null) {
      localStorage.setItem("autoVerify", "true");
    }
  }, []);

  useEffect(() => {
    async function loadSuggestions() {
      const keywords = await fetchAvailableKeywords(indexerMode);
      setSuggestions(keywords);
    }
    loadSuggestions();
  }, [indexerMode]);

  const cleanSuggestions = suggestions
    .sort((a, b) => a.localeCompare(b))
    .filter((keyword, index, array) => {
      if (keyword.endsWith("s") && array.includes(keyword.slice(0, -1))) {
        return false;
      }
      return true;
    });

  const displayKeywords = cleanSuggestions.slice(0, 8);

  const runVerification = async (dataToVerify: SearchResult[]) => {
    if (dataToVerify.length === 0) return;
    setVerifyAllInProgress(true);
    setVerifyAllResults({});

    for (const result of dataToVerify) {
      const hash = await hashResult(result);
      const storedStatus = localStorage.getItem(hash);

      if (storedStatus === "1") {
        setVerifyAllResults((prev) => ({ ...prev, [result.cid]: "1" }));
        continue;
      }

      try {
        const response = await verifyProofClientSide(
          result.proof,
          result.cid,
          result.totalScore,
          result.keywordScores,
        );
        const status = response.verified ? 1 : 0;
        setStoredVerified(hash, status);
        setVerifyAllResults((prev) => ({
          ...prev,
          [result.cid]: status ? "1" : "0",
        }));
      } catch {
        setStoredVerified(hash, 0);
        setVerifyAllResults((prev) => ({ ...prev, [result.cid]: "0" }));
      }
    }

    setVerifyAllInProgress(false);
  };

  const handleSearch = async (query: string, modeOverride?: IndexerMode) => {
    const mode = modeOverride ?? indexerMode;
    setIsLoading(true);
    setError(null);
    setVerifyAllResults({});
    setSearchQuery(query);
    setHasSearched(true);
    if (modeOverride !== undefined) setIndexerMode(mode);

    const response = await searchByKeyword(query, mode);

    if (response.success) {
      setResults(response.results);
      if (verifyAllEnabled) {
        const resultsToVerify = [...response.results].sort((a, b) => {
          const scoreA = getScoreForSorting(a, query);
          const scoreB = getScoreForSorting(b, query);
          return scoreB - scoreA;
        });

        runVerification(resultsToVerify);
      }
    } else {
      setError(response.error || "Search failed");
      setResults([]);
    }
    setIsLoading(false);
  };

  const getScoreForSorting = (result: SearchResult, query: string) => {
    if (!result.keywordScores || !query) return result.totalScore;
    const match = result.keywordScores.find(
      (k) => k.keyword.toLowerCase() === query.toLowerCase(),
    );
    return match ? match.score : result.totalScore;
  };

  const sortedResults = [...results].sort((a, b) => {
    const scoreA = getScoreForSorting(a, searchQuery);
    const scoreB = getScoreForSorting(b, searchQuery);
    return scoreB - scoreA;
  });

  const handleVerifyAllToggle = useCallback(
    async (enabled: boolean) => {
      setVerifyAllEnabled(enabled);
      localStorage.setItem("autoVerify", enabled ? "true" : "false");

      if (!enabled) {
        setVerifyAllResults({});
        return;
      }

      runVerification(sortedResults);
    },
    [sortedResults],
  );

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="py-6 px-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden">
              <img
                src="/openseo.jpeg"
                alt="OpenSEO Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">OpenSEO</h1>
              <p className="text-xs text-gray-500">Decentralized Search</p>
            </div>
          </div>
          <div className="flex items-center bg-gray-50/80 hover:bg-gray-100/80 border border-gray-200/80 rounded-full px-3 py-1.5 transition-all duration-200 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 cursor-default select-none">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-600"></span>
              </span>
              <span className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
                Indexer
              </span>
            </div>
            <div className="w-px h-4 bg-gray-300 mx-3"></div>
            <div className="relative flex items-center">
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
                className="appearance-none bg-transparent pl-0 pr-6 py-0 text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer w-auto"
              >
                <option value="blockchain">Blockchain</option>
                <option value="danger">Danger</option>
                <option value="english">English-Only</option>
                <option value="family-friendly">Family Friendly</option>
                <option value="general">General</option>
                <option value="safe">Safe</option>
              </select>
              <div className="pointer-events-none absolute right-0 text-gray-400">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Search */}
      <section
        className={`transition-all duration-500 ${hasSearched ? "py-8" : "py-20"}`}
      >
        <div className="max-w-5xl mx-auto px-4">
          {!hasSearched && (
            <div className="text-center mb-10 fade-in">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Search the Decentralized Web
              </h2>
              <p className="text-lg text-gray-600 max-w-xl mx-auto">
                Find verified websites with zero-knowledge proofs. Results are
                ranked by SEO score and cryptographically verifiable.
              </p>
            </div>
          )}

          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            isLoading={isLoading}
            indexerMode={indexerMode}
          />
        </div>
      </section>

      {/* Results */}
      <section className="pb-20">
        <div className="max-w-3xl mx-auto">
          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg
                className="h-10 w-10 text-primary-500 spinner"
                viewBox="0 0 24 24"
              >
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
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                We couldn't find any verified sites
                <br /> We're still in the demo phase <br />
              </h2>
            </div>
          )}

          {/* Results */}
          {!isLoading && !error && hasSearched && (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                  {results.length > 0 ? (
                    <>
                      Found{" "}
                      <span className="font-semibold text-gray-700">
                        {results.length}
                      </span>{" "}
                      results for &quot;
                      <span className="font-semibold text-gray-700">
                        {searchQuery}
                      </span>
                      &quot;
                    </>
                  ) : (
                    <>
                      No results found for &quot;
                      <span className="font-semibold text-gray-700">
                        {searchQuery}
                      </span>
                      &quot;
                    </>
                  )}
                </p>
                {results.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-sm text-gray-600">Auto Verify</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={verifyAllEnabled}
                      disabled={verifyAllInProgress}
                      onClick={() => handleVerifyAllToggle(!verifyAllEnabled)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 ${
                        verifyAllEnabled ? "bg-primary-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          verifyAllEnabled ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                )}
              </div>

              {/* Results list */}
              {results.length > 0 ? (
                <div className="space-y-4">
                  {sortedResults.map((result, index) => (
                    <ResultCard
                      key={result.cid}
                      result={result}
                      index={index}
                      verifyAllResult={verifyAllResults[result.cid] ?? null}
                      verifyAllInProgress={verifyAllInProgress}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 animate-fade-in">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-gray-900 mb-2">
                    No Results Found
                  </h3>
                  <p className="text-gray-500 mb-8">
                    We couldn't find any verified sites for "{searchQuery}".
                    <br /> We're still in the demo phase. <br />
                    To see how the search works try clicking one of these sample
                    keywords:
                  </p>
                  {displayKeywords.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                      {displayKeywords.map((topic, index) => (
                        <button
                          key={index}
                          onClick={() => handleSearch(topic)}
                          className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-primary-500 hover:text-primary-600 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-sm font-medium text-gray-700 flex items-center gap-2"
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  )}
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
