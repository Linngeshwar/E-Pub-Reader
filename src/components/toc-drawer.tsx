"use client";

export interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems: TocItem[];
}

interface TocDrawerProps {
  items: TocItem[];
  currentHref?: string;
  onNavigate: (href: string) => void;
  onClose: () => void;
}

function TocEntry({
  item,
  depth,
  currentHref,
  onNavigate,
}: {
  item: TocItem;
  depth: number;
  currentHref?: string;
  onNavigate: (href: string) => void;
}) {
  const isActive = currentHref && item.href === currentHref;

  return (
    <>
      <button
        onClick={() => onNavigate(item.href)}
        className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
          isActive
            ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            : "text-zinc-700 dark:text-zinc-300"
        }`}
        style={{ paddingLeft: `${16 + depth * 16}px` }}
      >
        {item.label.trim()}
      </button>
      {item.subitems?.map((sub) => (
        <TocEntry
          key={sub.id || sub.href}
          item={sub}
          depth={depth + 1}
          currentHref={currentHref}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

export default function TocDrawer({
  items,
  currentHref,
  onNavigate,
  onClose,
}: TocDrawerProps) {
  return (
    <div className="absolute inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative z-10 flex w-80 max-w-[85vw] flex-col bg-white shadow-2xl dark:bg-zinc-900 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Table of Contents
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

        {/* TOC list */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">
              No table of contents available
            </p>
          ) : (
            items.map((item) => (
              <TocEntry
                key={item.id || item.href}
                item={item}
                depth={0}
                currentHref={currentHref}
                onNavigate={onNavigate}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
