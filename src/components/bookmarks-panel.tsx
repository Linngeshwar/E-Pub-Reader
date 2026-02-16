"use client";

import type { Bookmark } from "@/lib/bookmarks";

interface BookmarksPanelProps {
  bookmarks: Bookmark[];
  onNavigate: (cfi: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export default function BookmarksPanel({
  bookmarks,
  onNavigate,
  onRemove,
  onClose,
}: BookmarksPanelProps) {
  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex w-80 max-w-[85vw] flex-col bg-white shadow-2xl dark:bg-zinc-900 animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Bookmarks
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

        <div className="flex-1 overflow-y-auto">
          {bookmarks.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-3xl mb-2">🔖</p>
              <p className="text-sm text-zinc-400">No bookmarks yet</p>
              <p className="text-xs text-zinc-400 mt-1">
                Tap the bookmark icon to save your place
              </p>
            </div>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="flex items-center border-b border-zinc-100 dark:border-zinc-800"
              >
                <button
                  onClick={() => onNavigate(bm.cfi)}
                  className="flex-1 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {bm.label || "Bookmark"}
                  </p>
                  {bm.chapter && (
                    <p className="text-xs text-zinc-400 mt-0.5">{bm.chapter}</p>
                  )}
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {new Date(bm.created_at).toLocaleDateString()}
                  </p>
                </button>
                <button
                  onClick={() => onRemove(bm.id)}
                  className="px-3 py-3 text-zinc-400 hover:text-red-500 transition-colors"
                  aria-label="Remove bookmark"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
