"use client";

import { useState, useCallback, useEffect } from "react";
import { fetchAvailableKeywords, type IndexerMode } from "../services/api";

interface SearchInputProps {
  value: string;
  onSearch: (query: string) => void;
  isLoading?: boolean;
  indexerMode: IndexerMode;
}

export function SearchInput({
  value,
  onSearch,
  isLoading = false,
  indexerMode,
}: SearchInputProps) {
  const [query, setQuery] = useState("");
  const [dbKeywords, setDbKeywords] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    async function loadKeywords() {
      const keywords = await fetchAvailableKeywords(indexerMode);
      setDbKeywords(keywords);
    }
    loadKeywords();
  }, [indexerMode]);

  const filteredKeywords = dbKeywords
    .filter((keyword) => keyword.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowDropdown(true);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowDropdown(false);
    onSearch(suggestion);
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim() && !isLoading) {
        setShowDropdown(false);
        onSearch(query.trim());
      }
    },
    [query, onSearch, isLoading],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && query.trim() && !isLoading) {
        setShowDropdown(false);
        onSearch(query.trim());
      }
    },
    [query, onSearch, isLoading],
  );

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search ..."
            disabled={isLoading}
            className="search-input w-full pl-12 pr-30 py-2 text-lg border-2 border-gray-200 rounded-2xl 
                       focus:outline-none focus:border-gray-500 
                       disabled:bg-gray-50 disabled:cursor-not-allowed
                       transition-all duration-300 ease-out"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 px-6 py-2.5 
                       bg-gray-500 text-white font-medium rounded-xl
                       hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                       transition-colors duration-200"
          >
            {isLoading ? (
              <svg className="h-5 w-5 spinner" viewBox="0 0 24 24">
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
            ) : (
              "Search"
            )}
          </button>
        </div>
      </form>

      {showDropdown && filteredKeywords.length > 0 && (
        <ul className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
          <li className="px-5 py-2.5 text-xs font-semibold text-gray-500 bg-gray-300 tracking-wider border-b border-gray-100">
            Suggestions
          </li>
          {filteredKeywords.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-4 py-2.5 cursor-pointer hover:bg-gray-50 flex items-center gap-3 text-gray-700 transition-colors border-b border-gray-50 last:border-0"
            >
              <span className="font-normal text-gray-500 text-sm">
                {suggestion}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
