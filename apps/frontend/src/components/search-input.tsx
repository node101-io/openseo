"use client";

import { useState, useCallback } from "react";

interface SearchInputProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function SearchInput({ onSearch, isLoading = false }: SearchInputProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim() && !isLoading) {
        onSearch(query.trim());
      }
    },
    [query, onSearch, isLoading],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && query.trim() && !isLoading) {
        onSearch(query.trim());
      }
    },
    [query, onSearch, isLoading],
  );

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          disabled={isLoading}
          className="search-input w-full pl-12 pr-24 py-4 text-lg border-2 border-gray-200 rounded-2xl 
                     focus:outline-none focus:border-primary-500 
                     disabled:bg-gray-50 disabled:cursor-not-allowed
                     transition-all duration-200"
        />
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 
                     bg-primary-500 text-white font-medium rounded-xl
                     hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed
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
  );
}
