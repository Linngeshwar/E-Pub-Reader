"use client";

import type { DictionaryResult } from "@/lib/dictionary";

interface DictionaryPopupProps {
  result: DictionaryResult | null;
  loading: boolean;
  onClose: () => void;
}

export default function DictionaryPopup({
  result,
  loading,
  onClose,
}: DictionaryPopupProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Popup */}
      <div className="relative z-10 mx-4 mb-4 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:mb-0 animate-in slide-in-from-bottom duration-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            {result && (
              <>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {result.word}
                </h3>
                {result.phonetic && (
                  <p className="text-sm text-zinc-400">{result.phonetic}</p>
                )}
              </>
            )}
            {loading && (
              <h3 className="text-lg font-semibold text-zinc-400">
                Looking up…
              </h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
          </div>
        )}

        {!loading && !result && (
          <p className="py-4 text-center text-sm text-zinc-400">
            No definition found.
          </p>
        )}

        {!loading && result && (
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {result.meanings.map((meaning, i) => (
              <div key={i}>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  {meaning.partOfSpeech}
                </p>
                <ol className="list-decimal space-y-1.5 pl-4">
                  {meaning.definitions.map((def, j) => (
                    <li key={j} className="text-sm text-zinc-700 dark:text-zinc-300">
                      {def.definition}
                      {def.example && (
                        <p className="mt-0.5 text-xs italic text-zinc-400">
                          &ldquo;{def.example}&rdquo;
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            {result.sourceUrl && (
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Source →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
