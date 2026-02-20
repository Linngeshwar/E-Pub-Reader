"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { supabase } from "@/lib/supabase";
import { getProgress } from "@/lib/reading-progress";
import {
  saveProgressWithSync,
  getQueuedCount,
  syncQueuedProgress,
} from "@/lib/progress-sync";
import { getOfflineBook } from "@/lib/offline-books";
import { createSession, endSession } from "@/lib/reading-stats";
import {
  getBookmarks,
  addBookmark,
  removeBookmark,
  type Bookmark,
} from "@/lib/bookmarks";
import BookmarksPanel from "@/components/bookmarks-panel";
import StatsPanel from "@/components/stats-panel";
import * as pdfjsLib from "pdfjs-dist";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFPageInfo {
  currentPage: number;
  totalPages: number;
  percentage: number;
}

export default function PDFViewer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const bookId = searchParams.get("book");
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [title, setTitle] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [pageInfo, setPageInfo] = useState<PDFPageInfo>({
    currentPage: 1,
    totalPages: 0,
    percentage: 0,
  });

  const [scale, setScale] = useState(1.5);
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [bookmarksList, setBookmarksList] = useState<Bookmark[]>([]);

  // Sync state
  const [syncPending, setSyncPending] = useState(false);
  const [syncCount, setSyncCount] = useState(0);

  // Session tracking
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<Date>(new Date());
  const startPageRef = useRef(0);

  // Render a specific page
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    setLoading(true);
    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      const viewport = page.getViewport({ scale });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      const totalPages = pdfDocRef.current.numPages;
      const percentage = Math.round((pageNum / totalPages) * 100);

      setPageInfo({
        currentPage: pageNum,
        totalPages,
        percentage,
      });
    } catch (err) {
      console.error("Error rendering page:", err);
    } finally {
      setLoading(false);
    }
  }, [scale]);

  // Navigation
  const goToPage = useCallback((pageNum: number) => {
    if (!pdfDocRef.current) return;
    const total = pdfDocRef.current.numPages;
    if (pageNum < 1 || pageNum > total) return;
    renderPage(pageNum);
  }, [renderPage]);

  const nextPage = useCallback(() => {
    goToPage(pageInfo.currentPage + 1);
  }, [pageInfo.currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(pageInfo.currentPage - 1);
  }, [pageInfo.currentPage, goToPage]);

  // Save progress
  const saveProgress = useCallback(async () => {
    if (!user || !bookId || !pdfDocRef.current) return;

    try {
      const result = await saveProgressWithSync(
        user.id,
        bookId,
        `page:${pageInfo.currentPage}`, // Use page number as "CFI"
        {
          reading_status: "reading",
          percent_complete: pageInfo.percentage,
          current_page: pageInfo.currentPage,
          total_pages: pageInfo.totalPages,
        },
      );

      if (result.queued) {
        setSyncPending(true);
        const count = await getQueuedCount(user.id);
        setSyncCount(count);
      } else if (result.success) {
        setSyncPending(false);
        setSyncCount(0);
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [user, bookId, pageInfo]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        prevPage();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        nextPage();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setScale((s) => Math.min(s + 0.1, 3));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setScale((s) => Math.max(s - 0.1, 0.5));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextPage, prevPage]);

  // Re-render when scale changes
  useEffect(() => {
    if (ready && pageInfo.currentPage > 0) {
      const currentPage = pageInfo.currentPage;
      renderPage(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, ready]); // Deliberately excluding pageInfo and renderPage to avoid loop

  // Auto-save
  useEffect(() => {
    if (!ready) return;
    saveTimerRef.current = setInterval(saveProgress, 10_000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      saveProgress();
    };
  }, [ready, saveProgress]);

  // Save on visibility change
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        saveProgress();
        if (sessionIdRef.current) {
          const duration = Math.round(
            (Date.now() - sessionStartRef.current.getTime()) / 1000,
          );
          const pagesRead = Math.max(
            0,
            pageInfo.currentPage - startPageRef.current,
          );
          endSession(
            sessionIdRef.current,
            duration,
            pagesRead,
            `page:${pageInfo.currentPage}`,
          );
          sessionIdRef.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [saveProgress, pageInfo]);

  // Check sync status
  useEffect(() => {
    if (!user) return;

    async function checkSyncStatus() {
      const count = await getQueuedCount(user!.id);
      setSyncCount(count);
      setSyncPending(count > 0);
    }

    checkSyncStatus();

    const handleOnline = async () => {
      await syncQueuedProgress();
      await checkSyncStatus();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user]);

  // Bookmark handlers
  const handleAddBookmark = useCallback(async () => {
    if (!user || !bookId) return;
    try {
      await addBookmark(
        user.id,
        bookId,
        `page:${pageInfo.currentPage}`,
        `Page ${pageInfo.currentPage}`,
      );
      const updated = await getBookmarks(user.id, bookId);
      setBookmarksList(updated);
    } catch (err) {
      console.error("Failed to add bookmark:", err);
    }
  }, [user, bookId, pageInfo.currentPage]);

  const handleRemoveBookmark = useCallback(
    async (bookmarkId: string) => {
      if (!user || !bookId) return;
      try {
        await removeBookmark(bookmarkId);
        const updated = await getBookmarks(user.id, bookId);
        setBookmarksList(updated);
      } catch (err) {
        console.error("Failed to remove bookmark:", err);
      }
    },
    [user, bookId],
  );

  const handleBookmarkNavigate = useCallback((cfi: string) => {
    // CFI format: "page:123"
    const pageNum = parseInt(cfi.replace("page:", ""));
    if (!isNaN(pageNum)) {
      goToPage(pageNum);
      setShowBookmarksPanel(false);
    }
  }, [goToPage]);

  // Check if current page is bookmarked
  const isBookmarked = bookmarksList.some(
    (b) => b.cfi === `page:${pageInfo.currentPage}`,
  );

  // Initialize PDF
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

    let cancelled = false;

    async function loadPDF() {
      try {
        setReady(false);
        setError(null);

        // Try offline first
        const offlineBook = await getOfflineBook(bookId!);
        let pdfData: ArrayBuffer | string;

        if (offlineBook?.blob) {
          console.log("Loading PDF from offline storage");
          pdfData = await offlineBook.blob.arrayBuffer();
        } else {
          console.log("Loading PDF from network");
          const {
            data: { publicUrl },
          } = supabase.storage.from("books").getPublicUrl(bookId!);
          pdfData = publicUrl;
        }

        const loadingTask = pdfjsLib.getDocument(pdfData);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTitle(bookId!.split("/").pop()?.replace(".pdf", "") || "PDF");

        // Load bookmarks
        try {
          const bookmarks = await getBookmarks(user!.id, bookId!);
          setBookmarksList(bookmarks);
        } catch {
          // Bookmarks table might not exist
        }

        // Get saved progress
        const progressData = await getProgress(user!.id, bookId!);
        let startPage = 1;

        if (progressData?.last_location_cfi) {
          const savedPage = parseInt(
            progressData.last_location_cfi.replace("page:", ""),
          );
          if (!isNaN(savedPage)) {
            startPage = savedPage;
          }
        } else if (progressData?.current_page) {
          startPage = progressData.current_page;
        }

        // Start session
        try {
          const sid = await createSession(
            user!.id,
            bookId!,
            `page:${startPage}`,
          );
          if (sid) sessionIdRef.current = sid;
          sessionStartRef.current = new Date();
          startPageRef.current = startPage;
        } catch {
          // Session table might not exist
        }

        if (!cancelled) {
          setReady(true);
          await renderPage(startPage);
        }
      } catch (err) {
        console.error("Failed to load PDF:", err);
        if (!cancelled) {
          setError("Failed to load PDF. Please try again.");
        }
      }
    }

    loadPDF();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, bookId, router, renderPage]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-4 dark:bg-zinc-950">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Top toolbar */}
      <div className="z-20 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-2 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/library")}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Back to library"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="max-w-md truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            onClick={() => setScale((s) => Math.max(s - 0.1, 0.5))}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Zoom out"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <span className="text-xs text-zinc-400">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(s + 0.1, 3))}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Zoom in"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>

          {/* Bookmark */}
          <button
            onClick={isBookmarked ? undefined : handleAddBookmark}
            className={`rounded-lg p-2 ${
              isBookmarked
                ? "text-amber-600 dark:text-amber-400"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
            title="Bookmark this page"
          >
            <svg className="h-5 w-5" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>

          {/* Bookmarks panel */}
          <button
            onClick={() => setShowBookmarksPanel(!showBookmarksPanel)}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="View bookmarks"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Stats */}
          <button
            onClick={() => setShowStats(!showStats)}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Reading stats"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-900"
      >
        <div className="flex min-h-full items-center justify-center p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-100/50 dark:bg-zinc-900/50">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="shadow-2xl"
            style={{
              backgroundColor: theme === "dark" ? "#18181b" : "#ffffff",
            }}
          />
        </div>
      </div>

      {/* Bottom controls */}
      <div className="z-20 border-t border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        {/* Progress bar */}
        <div className="h-0.5 w-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-zinc-900 transition-all duration-300 dark:bg-zinc-100"
            style={{ width: `${pageInfo.percentage}%` }}
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={prevPage}
            disabled={pageInfo.currentPage <= 1}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            {syncPending && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" title={`${syncCount} progress update${syncCount !== 1 ? 's' : ''} pending sync`}>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Offline</span>
              </span>
            )}
            <span>
              Page {pageInfo.currentPage} of {pageInfo.totalPages}
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {pageInfo.percentage}%
            </span>
          </div>

          <button
            onClick={nextPage}
            disabled={pageInfo.currentPage >= pageInfo.totalPages}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Panels */}
      {showBookmarksPanel && (
        <BookmarksPanel
          bookmarks={bookmarksList}
          onNavigate={handleBookmarkNavigate}
          onRemove={handleRemoveBookmark}
          onClose={() => setShowBookmarksPanel(false)}
        />
      )}

      {showStats && user && bookId && (
        <StatsPanel
          userId={user.id}
          bookId={bookId}
          bookTitle={title}
          percentComplete={pageInfo.percentage}
          currentSessionSeconds={0}
          totalPages={pageInfo.totalPages}
          currentPage={pageInfo.currentPage}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  );
}
