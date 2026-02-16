"use client";

import { useState, useCallback } from "react";

export interface SearchResult {
  cfi: string;
  excerpt: string;
  section: number;
}

interface SearchPanelProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onNavigate: (cfi: string) => void;
  onClose: () => void;
}

export default function SearchPanel({
  onSearch,
  onNavigate,
  onClose,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;

      setSearching(true);
      setSearched(false);
      try {
        const found = await onSearch(query.trim());
        setResults(found);
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      }
      setSearching(false);
      setSearched(true);
    },
    [query, onSearch],
  );

  function highlightExcerpt(excerpt: string, term: string) {
    const parts = excerpt.split(
      new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
    );
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark
          key={i}
          className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex w-96 max-w-[90vw] flex-col bg-white shadow-2xl dark:bg-zinc-900 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Search
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in book…"
              className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {searching ? "…" : "Search"}
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {searching && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
            </div>
          )}

          {!searching && searched && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">
              No results found for &ldquo;{query}&rdquo;
            </p>
          )}

          {!searching && results.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs text-zinc-400">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </p>
              {results.map((result, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate(result.cfi)}
                  className="w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                >
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3">
                    {highlightExcerpt(result.excerpt, query)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
