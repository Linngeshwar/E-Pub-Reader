"use client";

import type { Annotation } from "@/lib/annotations";

interface AnnotationsPanelProps {
  annotations: Annotation[];
  onNavigate: (cfi: string) => void;
  onRemove: (id: string, cfiRange: string) => void;
  onClose: () => void;
}

const colorMap: Record<string, string> = {
  yellow:
    "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-700",
  green:
    "bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700",
  blue: "bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700",
  red: "bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-700",
};

export default function AnnotationsPanel({
  annotations,
  onNavigate,
  onRemove,
  onClose,
}: AnnotationsPanelProps) {
  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex w-96 max-w-[90vw] flex-col bg-white shadow-2xl dark:bg-zinc-900 animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Highlights & Notes ({annotations.length})
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
          {annotations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-3xl mb-2">🖍️</p>
              <p className="text-sm text-zinc-400">No highlights yet</p>
              <p className="text-xs text-zinc-400 mt-1">
                Select text while reading to highlight it
              </p>
            </div>
          ) : (
            annotations.map((ann) => (
              <div
                key={ann.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <button
                  onClick={() => onNavigate(ann.cfi_range)}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <div
                    className={`rounded-lg border-l-4 px-3 py-2 ${colorMap[ann.color] || colorMap.yellow}`}
                  >
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 line-clamp-3">
                      &ldquo;{ann.text}&rdquo;
                    </p>
                  </div>
                  {ann.note && (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 italic">
                      📝 {ann.note}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-400">
                    {ann.chapter && <span>{ann.chapter}</span>}
                    <span>{new Date(ann.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
                <div className="flex justify-end px-4 pb-2">
                  <button
                    onClick={() => onRemove(ann.id, ann.cfi_range)}
                    className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
