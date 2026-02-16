"use client";

interface SelectionToolbarProps {
  selectedText: string;
  onHighlight: (color: string) => void;
  onLookup: () => void;
  onDismiss: () => void;
}

export default function SelectionToolbar({
  selectedText,
  onHighlight,
  onLookup,
  onDismiss,
}: SelectionToolbarProps) {
  return (
    <div className="absolute bottom-20 left-1/2 z-40 -translate-x-1/2 animate-in slide-in-from-bottom duration-150">
      <div className="flex items-center gap-1 rounded-2xl bg-white p-1.5 shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
        {/* Text preview */}
        <span className="max-w-32 truncate px-2 text-xs text-zinc-500 dark:text-zinc-400">
          &ldquo;{selectedText}&rdquo;
        </span>

        <div className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Highlight colors */}
        <button
          onClick={() => onHighlight("yellow")}
          className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          title="Highlight yellow"
        >
          <div className="h-4 w-4 rounded-full bg-yellow-300" />
        </button>
        <button
          onClick={() => onHighlight("green")}
          className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          title="Highlight green"
        >
          <div className="h-4 w-4 rounded-full bg-green-400" />
        </button>
        <button
          onClick={() => onHighlight("blue")}
          className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          title="Highlight blue"
        >
          <div className="h-4 w-4 rounded-full bg-blue-400" />
        </button>

        <div className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

        {/* Dictionary lookup */}
        <button
          onClick={onLookup}
          className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
          title="Look up definition"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </button>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
          title="Dismiss"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
