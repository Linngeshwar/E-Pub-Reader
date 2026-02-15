"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getProgress, upsertProgress } from "@/lib/reading-progress";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";

export default function ReaderView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const bookId = searchParams.get("book");
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const cfiRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtBeginningRef = useRef(false);

  const [title, setTitle] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [showCover, setShowCover] = useState(true);

  type NavigationDirection = "prev" | "next";
  type HideResult = "no-cover" | "advance" | "ignore" | "hidden";

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
      // Check if rendition exists and is ready to navigate
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

  // Debounced save
  const saveCfi = useCallback(async () => {
    if (!user || !bookId || !cfiRef.current) return;
    try {
      await upsertProgress(user.id, bookId, cfiRef.current);
      // Also cache in localStorage for offline
      localStorage.setItem(`cfi:${bookId}`, cfiRef.current);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [user, bookId]);

  // Save on visibilitychange
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        saveCfi();
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [saveCfi]);

  // Auto-save every 10 seconds
  useEffect(() => {
    if (!ready) return;
    saveTimerRef.current = setInterval(saveCfi, 10_000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      saveCfi(); // Save on unmount
    };
  }, [ready, saveCfi]);

  // Initialize book
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

    // Reset state when switching books
    setReady(false);
    setError(null);
    setTitle("");
    setCoverUrl(null);
    setShowCover(false);

    let cancelled = false;

    async function init() {
      try {
        const {
          data: { publicUrl },
        } = supabase.storage.from("books").getPublicUrl(bookId!);

        // Dynamic import — epub.js is CSR-only
        const ePub = (await import("epubjs")).default;

        const book = ePub(publicUrl);
        bookRef.current = book;

        const rendition = book.renderTo(viewerRef.current!, {
          width: "100%",
          height: "100%",
          spread: "auto",
          flow: "paginated",
        });

        // Don't assign to ref yet - wait until display() completes

        // Theme
        rendition.themes.default({
          body: {
            "font-family": "'Georgia', 'Times New Roman', serif !important",
            "line-height": "1.8 !important",
            padding: "0 16px !important",
            color: "#1a1a1a !important",
          },
          a: {
            color: "#4a5568 !important",
          },
        });

        // Dark mode support
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          rendition.themes.default({
            body: {
              "font-family": "'Georgia', 'Times New Roman', serif !important",
              "line-height": "1.8 !important",
              padding: "0 16px !important",
              color: "#e4e4e7 !important",
              background: "#09090b !important",
            },
            a: {
              color: "#a1a1aa !important",
            },
          });
        }

        // Get saved progress
        let startCfi: string | undefined;

        // Try remote first, fallback to local cache
        const progress = await getProgress(user!.id, bookId!);
        if (progress?.last_location_cfi) {
          startCfi = progress.last_location_cfi;
        } else {
          const cached = localStorage.getItem(`cfi:${bookId}`);
          if (cached) startCfi = cached;
        }

        startedAtBeginningRef.current = !startCfi;

        await rendition.display(startCfi);

        if (cancelled) return;

        // Now that display is complete, assign to ref
        renditionRef.current = rendition;

        // Track CFI on relocation
        rendition.on("relocated", (location: { start: { cfi: string } }) => {
          cfiRef.current = location.start.cfi;
        });

        // Tap to toggle UI
        rendition.on("click", () => {
          setShowUI((prev) => !prev);
        });

        // Get title
        const metadata = await book.loaded.metadata;
        if (!cancelled) setTitle(metadata.title || bookId!);

        // Extract cover
        try {
          const coverUrlFromBook = (await book.coverUrl()) as string | null;
          if (coverUrlFromBook && !cancelled) {
            setCoverUrl(coverUrlFromBook);
          }
        } catch {
          console.log("No cover found in EPUB");
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
      // Clean up both book and rendition
      if (renditionRef.current) {
        renditionRef.current = null;
      }
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, [user, authLoading, bookId, router]);

  // Auto-focus viewer when ready
  useEffect(() => {
    if (ready && viewerRef.current) {
      viewerRef.current.focus();
    }
  }, [ready]);

  // Keyboard navigation at window level
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigation("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigation("next");
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [handleNavigation, ready]);

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
    <div className="relative h-dvh w-full bg-white dark:bg-zinc-950">
      {/* Top bar */}
      <header
        className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-zinc-100 bg-white/90 px-4 py-2.5 backdrop-blur-md transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-950/90 ${
          showUI ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <button
          onClick={() => {
            saveCfi();
            router.push("/library");
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
          <span className="hidden sm:inline">Library</span>
        </button>
        <h1 className="max-w-[60%] truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {title}
        </h1>
        <div className="w-8" />
      </header>

      {/* Loading overlay */}
      {!ready && !error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
            <p className="text-xs text-zinc-400">Loading book…</p>
          </div>
        </div>
      )}

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

      {/* Navigation buttons — invisible touch targets on sides */}
      <button
        onClick={() => {
          handleNavigation("prev");
        }}
        className="absolute left-0 top-12 bottom-12 w-1/5 z-10 focus:outline-none md:w-24"
        aria-label="Previous page"
      />
      <button
        onClick={() => {
          handleNavigation("next");
        }}
        className="absolute right-0 top-12 bottom-12 w-1/5 z-10 focus:outline-none md:w-24"
        aria-label="Next page"
      />
    </div>
  );
}
