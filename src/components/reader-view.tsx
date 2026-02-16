"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { getProgress, upsertProgress } from "@/lib/reading-progress";
import { upsertBookMetadata } from "@/lib/book-metadata";
import {
  getBookmarks,
  addBookmark,
  removeBookmark,
  type Bookmark,
} from "@/lib/bookmarks";
import {
  getAnnotations,
  addAnnotation,
  removeAnnotation,
  type Annotation,
} from "@/lib/annotations";
import { createSession, endSession } from "@/lib/reading-stats";
import { lookupWord, type DictionaryResult } from "@/lib/dictionary";
import TocDrawer, { type TocItem } from "@/components/toc-drawer";
import SearchPanel, { type SearchResult } from "@/components/search-panel";
import DictionaryPopup from "@/components/dictionary-popup";
import BookmarksPanel from "@/components/bookmarks-panel";
import AnnotationsPanel from "@/components/annotations-panel";
import StatsPanel from "@/components/stats-panel";
import SelectionToolbar from "@/components/selection-toolbar";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";

interface ProgressInfo {
  percentage: number;
  currentPage: number;
  totalPages: number;
  currentChapter: string;
  currentHref: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubSection = any;

export default function ReaderView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const bookId = searchParams.get("book");
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const cfiRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtBeginningRef = useRef(false);

  // Core state
  const [title, setTitle] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [showCover, setShowCover] = useState(true);

  // Panel state
  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);
  const [showAnnotationsPanel, setShowAnnotationsPanel] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Data state
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [bookmarksList, setBookmarksList] = useState<Bookmark[]>([]);
  const [annotationsList, setAnnotationsList] = useState<Annotation[]>([]);
  const [progress, setProgress] = useState<ProgressInfo>({
    percentage: 0,
    currentPage: 0,
    totalPages: 0,
    currentChapter: "",
    currentHref: "",
  });

  // Selection state
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [selectedCfiRange, setSelectedCfiRange] = useState<string | null>(null);

  // Dictionary state
  const [dictionaryResult, setDictionaryResult] =
    useState<DictionaryResult | null>(null);
  const [showDictionary, setShowDictionary] = useState(false);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);

  // Reading session tracking
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<Date>(new Date());
  const startPageRef = useRef(0);

  // Helpers
  type NavigationDirection = "prev" | "next";
  type HideResult = "no-cover" | "advance" | "ignore" | "hidden";

  const handleNavigationRef = useRef<(direction: NavigationDirection) => void>(
    () => {},
  );

  // Close all panels helper
  const closeAllPanels = useCallback(() => {
    setShowToc(false);
    setShowSearch(false);
    setShowBookmarksPanel(false);
    setShowAnnotationsPanel(false);
    setShowStats(false);
    setShowDictionary(false);
    setSelectedText(null);
    setSelectedCfiRange(null);
  }, []);

  const hideCover = useCallback(
    (direction: NavigationDirection): HideResult => {
      if (!showCover) return "no-cover";
      setShowCover(false);
      if (startedAtBeginningRef.current) {
        const shouldAdvance = direction === "next";
        startedAtBeginningRef.current = false;
        return shouldAdvance ? "advance" : "ignore";
      }
      return "hidden";
    },
    [showCover],
  );

  const handleNavigation = useCallback(
    (direction: NavigationDirection) => {
      const rendition = renditionRef.current;
      if (!rendition || !ready) return;
      const result = hideCover(direction);
      if (result === "advance") {
        rendition.next();
        return;
      }
      if (result === "ignore") {
        return;
      }
      if (direction === "prev") {
        rendition.prev();
      } else {
        rendition.next();
      }
    },
    [hideCover, ready],
  );

  useEffect(() => {
    handleNavigationRef.current = handleNavigation;
  }, [handleNavigation]);

  // Enhanced save with progress info
  const saveCfi = useCallback(async () => {
    if (!user || !bookId || !cfiRef.current) return;
    try {
      await upsertProgress(user.id, bookId, cfiRef.current, {
        reading_status: "reading",
        percent_complete: progress.percentage,
        current_page: progress.currentPage,
        total_pages: progress.totalPages,
      });
      localStorage.setItem(`cfi:${bookId}`, cfiRef.current);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [user, bookId, progress]);

  // Save on visibilitychange
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        saveCfi();
        // End session on hide
        if (sessionIdRef.current) {
          const duration = Math.round(
            (Date.now() - sessionStartRef.current.getTime()) / 1000,
          );
          const pagesRead = Math.max(
            0,
            progress.currentPage - startPageRef.current,
          );
          endSession(
            sessionIdRef.current,
            duration,
            pagesRead,
            cfiRef.current || undefined,
          );
          sessionIdRef.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [saveCfi, progress]);

  // Auto-save every 10 seconds
  useEffect(() => {
    if (!ready) return;
    saveTimerRef.current = setInterval(saveCfi, 10_000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      saveCfi();
    };
  }, [ready, saveCfi]);

  // ── Book initialization ──────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (!bookId) {
      router.replace("/library");
      return;
    }
    if (!viewerRef.current) return;

    setReady(false);
    setError(null);
    setTitle("");
    setCoverUrl(null);
    setShowCover(false);
    setTocItems([]);
    setBookmarksList([]);
    setAnnotationsList([]);

    let cancelled = false;

    async function init() {
      try {
        const {
          data: { publicUrl },
        } = supabase.storage.from("books").getPublicUrl(bookId!);

        const epubModule = await import("epubjs");
        const ePub = epubModule.default || epubModule;

        const book = ePub(publicUrl);
        bookRef.current = book;

        const rendition = book.renderTo(viewerRef.current!, {
          width: "100%",
          height: "100%",
          spread: "auto",
          flow: "paginated",
        });

        // Keyboard in iframe
        rendition.on("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
            e.preventDefault();
            handleNavigationRef.current("prev");
          } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
            e.preventDefault();
            handleNavigationRef.current("next");
          }
        });

        // Register themes
        rendition.themes.register("light", {
          body: {
            "font-family": "'Georgia', 'Times New Roman', serif !important",
            "line-height": "1.8 !important",
            padding: "0 16px !important",
            color: "#1a1a1a !important",
            background: "#ffffff !important",
          },
          a: { color: "#4a5568 !important" },
        });

        rendition.themes.register("dark", {
          body: {
            "font-family": "'Georgia', 'Times New Roman', serif !important",
            "line-height": "1.8 !important",
            padding: "0 16px !important",
            color: "#e4e4e7 !important",
            background: "#09090b !important",
          },
          a: { color: "#a1a1aa !important" },
        });

        rendition.themes.select(theme);

        // Get saved progress
        let startCfi: string | undefined;
        const progressData = await getProgress(user!.id, bookId!);
        if (progressData?.last_location_cfi) {
          startCfi = progressData.last_location_cfi;
        } else {
          const cached = localStorage.getItem(`cfi:${bookId}`);
          if (cached) startCfi = cached;
        }

        startedAtBeginningRef.current = !startCfi;

        await rendition.display(startCfi);

        if (cancelled) return;

        renditionRef.current = rendition;

        // ── Track relocation for progress ──────────────────────────
        rendition.on(
          "relocated",
          (location: {
            start: {
              cfi: string;
              percentage: number;
              displayed: { page: number; total: number };
              href: string;
            };
          }) => {
            cfiRef.current = location.start.cfi;

            // Find current chapter from TOC
            let chapterName = "";
            const href = location.start.href;
            const toc = (book.navigation?.toc as TocItem[]) || [];

            function findChapter(items: TocItem[]): string | null {
              for (const item of items) {
                if (
                  href &&
                  item.href &&
                  href.includes(item.href.split("#")[0])
                ) {
                  return item.label.trim();
                }
                if (item.subitems?.length) {
                  const found = findChapter(item.subitems);
                  if (found) return found;
                }
              }
              return null;
            }
            chapterName = findChapter(toc) || "";

            setProgress({
              percentage: Math.round((location.start.percentage || 0) * 100),
              currentPage: location.start.displayed?.page || 0,
              totalPages: location.start.displayed?.total || 0,
              currentChapter: chapterName,
              currentHref: href,
            });
          },
        );

        // ── Text selection for highlighting & dictionary ───────────
        rendition.on(
          "selected",
          (cfiRange: string, contents: { window: Window }) => {
            const selection = contents.window.getSelection();
            const text = selection?.toString().trim();
            if (text && text.length > 0) {
              setSelectedText(text);
              setSelectedCfiRange(cfiRange);
            }
          },
        );

        // Clear selection when clicking elsewhere
        rendition.on("click", () => {
          setSelectedText(null);
          setSelectedCfiRange(null);
        });

        // ── Load TOC ───────────────────────────────────────────────
        const navigation = await book.loaded.navigation;
        if (!cancelled && navigation?.toc) {
          setTocItems(navigation.toc as TocItem[]);
        }

        // ── Generate locations for accurate percentage ─────────────
        book.ready.then(() => {
          if (!cancelled) {
            book.locations.generate(1024).catch(() => {
              // Locations generation may fail for some EPUBs
            });
          }
        });

        // ── Extract metadata ───────────────────────────────────────
        const metadata = await book.loaded.metadata;
        if (!cancelled) {
          setTitle(metadata.title || bookId!);

          // Save metadata to DB
          upsertBookMetadata(user!.id, bookId!, {
            title: metadata.title || null,
            author: metadata.creator || null,
            publisher: metadata.publisher || null,
            publication_date: metadata.pubdate || null,
            description: metadata.description || null,
            language: metadata.language || null,
          }).catch(() => {});
        }

        // ── Extract cover ──────────────────────────────────────────
        try {
          const coverUrlFromBook = (await book.coverUrl()) as string | null;
          if (coverUrlFromBook && !cancelled) {
            setCoverUrl(coverUrlFromBook);
          }
        } catch {
          // No cover
        }

        // ── Load bookmarks & annotations ───────────────────────────
        try {
          const [bms, anns] = await Promise.all([
            getBookmarks(user!.id, bookId!),
            getAnnotations(user!.id, bookId!),
          ]);
          if (!cancelled) {
            setBookmarksList(bms);
            setAnnotationsList(anns);

            // Apply existing annotations as highlights
            anns.forEach((ann) => {
              try {
                rendition.annotations.highlight(
                  ann.cfi_range,
                  {},
                  () => {},
                  "hl",
                  {
                    fill:
                      ann.color === "yellow"
                        ? "rgba(255,255,0,0.3)"
                        : ann.color === "green"
                          ? "rgba(0,200,0,0.3)"
                          : ann.color === "blue"
                            ? "rgba(100,149,237,0.3)"
                            : "rgba(255,200,200,0.3)",
                  },
                );
              } catch {
                // Skip invalid CFI ranges
              }
            });
          }
        } catch {
          // Bookmarks/annotations tables may not exist yet
        }

        // ── Start reading session ──────────────────────────────────
        try {
          const sid = await createSession(
            user!.id,
            bookId!,
            startCfi || undefined,
          );
          if (sid) sessionIdRef.current = sid;
          sessionStartRef.current = new Date();
          startPageRef.current = 0;
        } catch {
          // Reading sessions table may not exist yet
        }

        if (!cancelled) {
          setShowCover(startedAtBeginningRef.current);
          setReady(true);
        }
      } catch (err) {
        console.error("Failed to load book:", err);
        if (!cancelled) setError("Failed to load book. Please try again.");
      }
    }

    init();

    return () => {
      cancelled = true;
      // End session on cleanup
      if (sessionIdRef.current) {
        const duration = Math.round(
          (Date.now() - sessionStartRef.current.getTime()) / 1000,
        );
        endSession(
          sessionIdRef.current,
          duration,
          0,
          cfiRef.current || undefined,
        );
        sessionIdRef.current = null;
      }
      if (renditionRef.current) {
        renditionRef.current = null;
      }
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, bookId, router]);

  // Sync epub rendition theme
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.select(theme);
    }
  }, [theme]);

  // Auto-focus viewer
  useEffect(() => {
    if (ready && viewerRef.current) {
      viewerRef.current.focus();
    }
  }, [ready]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't handle if a panel is open
      if (showSearch) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleNavigation("prev");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        handleNavigation("next");
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [handleNavigation, ready, showSearch]);

  // ── Action handlers ────────────────────────────────────────────

  const handleTocNavigate = useCallback((href: string) => {
    renditionRef.current?.display(href);
    setShowToc(false);
  }, []);

  const handleSearchNavigate = useCallback((cfi: string) => {
    renditionRef.current?.display(cfi);
    setShowSearch(false);
  }, []);

  const handleSearch = useCallback(
    async (query: string): Promise<SearchResult[]> => {
      const book = bookRef.current;
      if (!book || !query.trim()) return [];

      const results: SearchResult[] = [];
      const spineItems = (
        book.spine as unknown as { spineItems: EpubSection[] }
      ).spineItems;

      for (const item of spineItems) {
        try {
          await item.load(book.load.bind(book));
          const findings: { cfi: string; excerpt: string }[] = item.find(query);
          findings.forEach((result) => {
            results.push({
              cfi: result.cfi,
              excerpt: result.excerpt,
              section: item.index,
            });
          });
          item.unload();
        } catch {
          // Skip sections that fail to load
        }
      }

      return results;
    },
    [],
  );

  const handleAddBookmark = useCallback(async () => {
    if (!user || !bookId || !cfiRef.current) return;
    const bm = await addBookmark(
      user.id,
      bookId,
      cfiRef.current,
      `Page ${progress.currentPage}`,
      progress.currentChapter || undefined,
    );
    if (bm) setBookmarksList((prev) => [...prev, bm]);
  }, [user, bookId, progress]);

  const handleRemoveBookmark = useCallback(async (id: string) => {
    await removeBookmark(id);
    setBookmarksList((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const handleBookmarkNavigate = useCallback((cfi: string) => {
    renditionRef.current?.display(cfi);
    setShowBookmarksPanel(false);
  }, []);

  const handleHighlight = useCallback(
    async (color: string = "yellow") => {
      if (!user || !bookId || !selectedCfiRange || !selectedText) return;
      const ann = await addAnnotation(
        user.id,
        bookId,
        selectedCfiRange,
        selectedText,
        undefined,
        color,
        progress.currentChapter || undefined,
      );
      if (ann) {
        setAnnotationsList((prev) => [...prev, ann]);
        try {
          renditionRef.current?.annotations.highlight(
            selectedCfiRange,
            {},
            () => {},
            "hl",
            {
              fill:
                color === "yellow"
                  ? "rgba(255,255,0,0.3)"
                  : color === "green"
                    ? "rgba(0,200,0,0.3)"
                    : color === "blue"
                      ? "rgba(100,149,237,0.3)"
                      : "rgba(255,200,200,0.3)",
            },
          );
        } catch {
          // Highlight rendering may fail
        }
      }
      setSelectedText(null);
      setSelectedCfiRange(null);
    },
    [user, bookId, selectedCfiRange, selectedText, progress],
  );

  const handleRemoveAnnotation = useCallback(
    async (id: string, cfiRange: string) => {
      await removeAnnotation(id);
      setAnnotationsList((prev) => prev.filter((a) => a.id !== id));
      try {
        renditionRef.current?.annotations.remove(cfiRange, "highlight");
      } catch {
        // May fail if annotation not rendered
      }
    },
    [],
  );

  const handleAnnotationNavigate = useCallback((cfi: string) => {
    renditionRef.current?.display(cfi);
    setShowAnnotationsPanel(false);
  }, []);

  const handleDictionaryLookup = useCallback(async () => {
    if (!selectedText) return;
    setDictionaryLoading(true);
    setShowDictionary(true);
    const result = await lookupWord(selectedText);
    setDictionaryResult(result);
    setDictionaryLoading(false);
    setSelectedText(null);
    setSelectedCfiRange(null);
  }, [selectedText]);

  const handleDismissSelection = useCallback(() => {
    setSelectedText(null);
    setSelectedCfiRange(null);
  }, []);

  // Check if current page is bookmarked
  const isCurrentPageBookmarked = bookmarksList.some(
    (bm) => bm.cfi === cfiRef.current,
  );

  // Current session time
  const [sessionSeconds, setSessionSeconds] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      setSessionSeconds(
        Math.round((Date.now() - sessionStartRef.current.getTime()) / 1000),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [ready]);

  // ── Render ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 dark:bg-zinc-950">
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={() => router.push("/library")}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-white dark:bg-zinc-950">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="z-20 flex items-center justify-between border-b border-zinc-100 bg-white/90 px-2 py-2 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90 sm:px-4">
        {/* Left: Back + TOC + Search */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              saveCfi();
              router.push("/library");
            }}
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Back to library"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* TOC button */}
          <button
            onClick={() => {
              closeAllPanels();
              setShowToc(true);
            }}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Table of contents"
            title="Table of Contents"
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
                d="M4 6h16M4 12h16M4 18h7"
              />
            </svg>
          </button>

          {/* Search button */}
          <button
            onClick={() => {
              closeAllPanels();
              setShowSearch(true);
            }}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Search"
            title="Search in book"
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        </div>

        {/* Center: Title */}
        <h1 className="max-w-[35%] truncate text-sm font-medium text-zinc-700 dark:text-zinc-300 sm:max-w-[50%]">
          {title}
        </h1>

        {/* Right: Bookmark + Annotations + Stats + Theme */}
        <div className="flex items-center gap-0.5">
          {/* Bookmark current page */}
          <button
            onClick={handleAddBookmark}
            className={`rounded-lg p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              isCurrentPageBookmarked
                ? "text-amber-500"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
            aria-label="Bookmark this page"
            title="Bookmark"
          >
            <svg
              className="h-5 w-5"
              fill={isCurrentPageBookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>

          {/* Bookmarks list */}
          <button
            onClick={() => {
              closeAllPanels();
              setShowBookmarksPanel(true);
            }}
            className="relative rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="View bookmarks"
            title="Bookmarks"
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
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            {bookmarksList.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                {bookmarksList.length}
              </span>
            )}
          </button>

          {/* Annotations */}
          <button
            onClick={() => {
              closeAllPanels();
              setShowAnnotationsPanel(true);
            }}
            className="relative rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="View highlights"
            title="Highlights & Notes"
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
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
            {annotationsList.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-500 text-[8px] font-bold text-white">
                {annotationsList.length}
              </span>
            )}
          </button>

          {/* Stats */}
          <button
            onClick={() => {
              closeAllPanels();
              setShowStats(true);
            }}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Reading stats"
            title="Reading Stats"
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </button>

          {/* Theme */}
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? (
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
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
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
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Loading overlay ───────────────────────────────────────── */}
      {!ready && !error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
            <p className="text-xs text-zinc-400">Loading book…</p>
          </div>
        </div>
      )}

      {/* ── Main content area ─────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Cover overlay */}
        {showCover && ready && coverUrl && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-white dark:bg-zinc-950"
            onClick={() => handleNavigation("next")}
          >
            <div className="flex h-full max-h-[80vh] flex-col items-center justify-center gap-4 px-4">
              <div className="relative aspect-2/3 w-full max-w-sm overflow-hidden rounded-xl shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt={title}
                  className="h-full w-full object-cover"
                />
              </div>
              <h1 className="max-w-md text-center text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {title}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Press any arrow key or tap to start reading
              </p>
            </div>
          </div>
        )}

        {/* EPUB container */}
        <div
          ref={viewerRef}
          className="h-full w-full focus:outline-none"
          tabIndex={0}
        />

        {/* Navigation buttons */}
        <button
          onClick={() => handleNavigation("prev")}
          className="absolute left-0 top-0 bottom-0 z-10 w-1/5 focus:outline-none md:w-24"
          aria-label="Previous page"
        />
        <button
          onClick={() => handleNavigation("next")}
          className="absolute right-0 top-0 bottom-0 z-10 w-1/5 focus:outline-none md:w-24"
          aria-label="Next page"
        />

        {/* ── Panels & Overlays ─────────────────────────────────── */}

        {/* TOC drawer */}
        {showToc && (
          <TocDrawer
            items={tocItems}
            currentHref={progress.currentHref}
            onNavigate={handleTocNavigate}
            onClose={() => setShowToc(false)}
          />
        )}

        {/* Search panel */}
        {showSearch && (
          <SearchPanel
            onSearch={handleSearch}
            onNavigate={handleSearchNavigate}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* Bookmarks panel */}
        {showBookmarksPanel && (
          <BookmarksPanel
            bookmarks={bookmarksList}
            onNavigate={handleBookmarkNavigate}
            onRemove={handleRemoveBookmark}
            onClose={() => setShowBookmarksPanel(false)}
          />
        )}

        {/* Annotations panel */}
        {showAnnotationsPanel && (
          <AnnotationsPanel
            annotations={annotationsList}
            onNavigate={handleAnnotationNavigate}
            onRemove={handleRemoveAnnotation}
            onClose={() => setShowAnnotationsPanel(false)}
          />
        )}

        {/* Stats panel */}
        {showStats && user && bookId && (
          <StatsPanel
            userId={user.id}
            bookId={bookId}
            bookTitle={title}
            percentComplete={progress.percentage}
            currentSessionSeconds={sessionSeconds}
            totalPages={progress.totalPages}
            currentPage={progress.currentPage}
            onClose={() => setShowStats(false)}
          />
        )}

        {/* Dictionary popup */}
        {showDictionary && (
          <DictionaryPopup
            result={dictionaryResult}
            loading={dictionaryLoading}
            onClose={() => {
              setShowDictionary(false);
              setDictionaryResult(null);
            }}
          />
        )}

        {/* Selection toolbar */}
        {selectedText && !showDictionary && (
          <SelectionToolbar
            selectedText={selectedText}
            onHighlight={handleHighlight}
            onLookup={handleDictionaryLookup}
            onDismiss={handleDismissSelection}
          />
        )}
      </div>

      {/* ── Bottom progress bar ───────────────────────────────────── */}
      {ready && !showCover && (
        <div className="z-20 border-t border-zinc-100 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
          {/* Thin progress bar */}
          <div className="h-0.5 w-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-zinc-900 transition-all duration-300 dark:bg-zinc-100"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>

          {/* Info row */}
          <div className="flex items-center justify-between px-4 py-1.5">
            <p className="max-w-[50%] truncate text-xs text-zinc-400">
              {progress.currentChapter || "—"}
            </p>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              {progress.totalPages > 0 && (
                <span>
                  {progress.currentPage}/{progress.totalPages}
                </span>
              )}
              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                {progress.percentage}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
