"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import {
  getAllProgress,
  updateReadingStatus,
  type ReadingProgress,
} from "@/lib/reading-progress";
import { getAllBookMetadata, type BookMetadata } from "@/lib/book-metadata";
import {
  downloadBookOffline,
  removeBookOffline,
  getAllOfflineBooks,
  getOfflineStorageSize,
  formatBytes,
} from "@/lib/offline-books";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

interface BookFile {
  name: string;
  id: string;
  url: string;
  coverUrl: string | null;
}

type ViewMode = "grid" | "list";
type SortBy = "name" | "recent" | "author" | "status";
type StatusFilter =
  | "all"
  | "not_started"
  | "reading"
  | "finished"
  | "abandoned";

const statusLabels: Record<string, string> = {
  not_started: "Not Started",
  reading: "Reading",
  finished: "Finished",
  abandoned: "Abandoned",
};

const statusColors: Record<string, string> = {
  not_started: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  reading: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  finished:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  abandoned: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

export default function LibraryPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<BookFile[]>([]);
  const [fetching, setFetching] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [progressMap, setProgressMap] = useState<
    Record<string, ReadingProgress>
  >({});
  const [metadataMap, setMetadataMap] = useState<Record<string, BookMetadata>>(
    {},
  );
  const [statusMenuBook, setStatusMenuBook] = useState<string | null>(null);
  const [offlineBooks, setOfflineBooks] = useState<Set<string>>(new Set());
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(
    new Set(),
  );
  const [storageSize, setStorageSize] = useState<number>(0);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  // Fetch books, progress, and metadata
  useEffect(() => {
    if (!user) return;

    async function fetchAll() {
      // Fetch books from storage
      const userFolder = user!.id;
      const { data, error } = await supabase.storage
        .from("books")
        .list(userFolder, {
          limit: 200,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) {
        console.error("Error listing books:", error);
        setFetching(false);
        return;
      }

      // Filter for both EPUB and PDF files
      const books = (data || []).filter((f) => {
        const name = f.name.toLowerCase();
        return name.endsWith(".epub") || name.endsWith(".pdf");
      });

      const mapped: BookFile[] = await Promise.all(
        books.map(async (f) => {
          const filePath = `${userFolder}/${f.name}`;
          const {
            data: { publicUrl },
          } = supabase.storage.from("books").getPublicUrl(filePath);

          const coverPath = `${userFolder}/.covers/${f.name}.jpg`;
          const { data: coverData } = await supabase.storage
            .from("books")
            .list(`${userFolder}/.covers`, {
              search: `${f.name}.jpg`,
            });

          let coverUrl = null;
          if (coverData && coverData.length > 0) {
            const { data: coverPublic } = supabase.storage
              .from("books")
              .getPublicUrl(coverPath);
            coverUrl = coverPublic.publicUrl;
          }

          return {
            name: f.name.replace(/\.(epub|pdf)$/i, ""),
            id: filePath,
            url: publicUrl,
            coverUrl,
          };
        }),
      );

      setBooks(mapped);

      // Fetch progress and metadata in parallel
      const [progressList, metadataList] = await Promise.all([
        getAllProgress(user!.id),
        getAllBookMetadata(user!.id),
      ]);

      const pMap: Record<string, ReadingProgress> = {};
      progressList.forEach((p) => {
        pMap[p.book_id] = p;
      });
      setProgressMap(pMap);

      const mMap: Record<string, BookMetadata> = {};
      metadataList.forEach((m) => {
        mMap[m.book_id] = m;
      });
      setMetadataMap(mMap);

      setFetching(false);
    }

    fetchAll();
  }, [user]);

  // Load offline books status
  useEffect(() => {
    async function loadOfflineStatus() {
      const offline = await getAllOfflineBooks();
      const offlineSet = new Set(offline.map((b) => b.bookId));
      setOfflineBooks(offlineSet);
      const size = await getOfflineStorageSize();
      setStorageSize(size);
    }
    loadOfflineStatus();
  }, []);

  // Handle offline download
  const handleDownloadOffline = async (book: BookFile) => {
    setDownloadingBooks((prev) => new Set(prev).add(book.id));
    try {
      const title = metadataMap[book.id]?.title || book.name;
      await downloadBookOffline(book.id, title, book.url);
      setOfflineBooks((prev) => new Set(prev).add(book.id));
      const size = await getOfflineStorageSize();
      setStorageSize(size);
    } catch (error) {
      console.error("Failed to download book:", error);
      alert("Failed to download book for offline reading");
    } finally {
      setDownloadingBooks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(book.id);
        return newSet;
      });
    }
  };

  // Handle offline removal
  const handleRemoveOffline = async (bookId: string) => {
    try {
      await removeBookOffline(bookId);
      setOfflineBooks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(bookId);
        return newSet;
      });
      const size = await getOfflineStorageSize();
      setStorageSize(size);
    } catch (error) {
      console.error("Failed to remove offline book:", error);
      alert("Failed to remove offline book");
    }
  };

  // Recently read books (top 4 with reading status)
  const recentlyRead = useMemo(() => {
    const reading = books.filter((b) => {
      const p = progressMap[b.id];
      return p && p.reading_status === "reading";
    });
    // Sort by updated_at descending
    reading.sort((a, b) => {
      const pa = progressMap[a.id]?.updated_at || "";
      const pb = progressMap[b.id]?.updated_at || "";
      return pb.localeCompare(pa);
    });
    return reading.slice(0, 4);
  }, [books, progressMap]);

  // Filtered and sorted books
  const displayBooks = useMemo(() => {
    let filtered = [...books];

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((b) => {
        const status = progressMap[b.id]?.reading_status || "not_started";
        return status === statusFilter;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name": {
          const nameA = metadataMap[a.id]?.title || a.name;
          const nameB = metadataMap[b.id]?.title || b.name;
          return nameA.localeCompare(nameB);
        }
        case "recent": {
          const dateA = progressMap[a.id]?.updated_at || "";
          const dateB = progressMap[b.id]?.updated_at || "";
          return dateB.localeCompare(dateA) || a.name.localeCompare(b.name);
        }
        case "author": {
          const authA = metadataMap[a.id]?.author || "zzz";
          const authB = metadataMap[b.id]?.author || "zzz";
          return authA.localeCompare(authB);
        }
        case "status": {
          const statA = progressMap[a.id]?.reading_status || "not_started";
          const statB = progressMap[b.id]?.reading_status || "not_started";
          const order = ["reading", "not_started", "finished", "abandoned"];
          return order.indexOf(statA) - order.indexOf(statB);
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [books, sortBy, statusFilter, progressMap, metadataMap]);

  const handleStatusChange = async (bookId: string, status: string) => {
    if (!user) return;
    await updateReadingStatus(user.id, bookId, status);
    setProgressMap((prev) => ({
      ...prev,
      [bookId]: {
        ...prev[bookId],
        reading_status: status,
        updated_at: new Date().toISOString(),
      } as ReadingProgress,
    }));
    setStatusMenuBook(null);
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            📖 Library
          </h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/library/upload"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Upload
            </Link>
            <span className="hidden text-xs text-zinc-400 sm:inline">
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {fetching ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
          </div>
        ) : books.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mb-4 text-5xl">📚</div>
            <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              No books yet
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Upload EPUB or PDF files to your Supabase &quot;books&quot; storage
              bucket in a folder named with your user ID:{" "}
              <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                {user.id}
              </code>
            </p>
          </div>
        ) : (
          <>
            {/* ── Continue Reading ────────────────────────────── */}
            {recentlyRead.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Continue Reading
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {recentlyRead.map((book) => {
                    const meta = metadataMap[book.id];
                    const prog = progressMap[book.id];
                    return (
                      <Link
                        key={book.id}
                        href={`/reader?book=${encodeURIComponent(book.id)}`}
                        className="group flex gap-3 rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900"
                      >
                        <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-700">
                          {book.coverUrl ? (
                            <Image
                              src={book.coverUrl}
                              alt={book.name}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-2xl">
                              📕
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {meta?.title || book.name}
                          </p>
                          {meta?.author && (
                            <p className="text-xs text-zinc-400 truncate">
                              {meta.author}
                            </p>
                          )}
                          {prog &&
                            typeof prog.percent_complete === "number" && (
                              <div className="mt-2">
                                <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                                  <div
                                    className="h-full rounded-full bg-blue-500 transition-all"
                                    style={{
                                      width: `${prog.percent_complete}%`,
                                    }}
                                  />
                                </div>
                                <p className="mt-0.5 text-[10px] text-zinc-400">
                                  {Math.round(prog.percent_complete || 0)}%
                                  complete
                                </p>
                              </div>
                            )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Toolbar: View toggle, Sort, Filter ─────────── */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-lg bg-zinc-200/60 p-0.5 dark:bg-zinc-800">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === "grid"
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
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
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === "list"
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
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
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
              </div>

              {/* Sort select */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <option value="recent">Recently Read</option>
                <option value="name">Title</option>
                <option value="author">Author</option>
                <option value="status">Status</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <option value="all">All Books</option>
                <option value="not_started">Not Started</option>
                <option value="reading">Reading</option>
                <option value="finished">Finished</option>
                <option value="abandoned">Abandoned</option>
              </select>

              <span className="text-xs text-zinc-400 ml-auto">
                {displayBooks.length} book{displayBooks.length !== 1 ? "s" : ""}
              </span>

              {/* Offline storage info */}
              {storageSize > 0 && (
                <div className="text-xs text-zinc-400 flex items-center gap-1">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                    />
                  </svg>
                  {offlineBooks.size} offline · {formatBytes(storageSize)}
                </div>
              )}
            </div>

            {/* ── Books display ───────────────────────────────── */}
            {displayBooks.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-400">
                No books match the selected filter.
              </p>
            ) : viewMode === "grid" ? (
              /* Grid view */
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {displayBooks.map((book) => {
                  const meta = metadataMap[book.id];
                  const prog = progressMap[book.id];
                  const status = prog?.reading_status || "not_started";
                  const isOffline = offlineBooks.has(book.id);
                  const isDownloading = downloadingBooks.has(book.id);

                  return (
                    <div key={book.id} className="group relative">
                      <Link
                        href={`/reader?book=${encodeURIComponent(book.id)}`}
                      >
                        <div className="relative mb-2 aspect-2/3 overflow-hidden rounded-xl bg-linear-to-br from-zinc-200 to-zinc-300 transition-transform group-hover:scale-[1.02] dark:from-zinc-800 dark:to-zinc-700">
                          {/* Offline indicator */}
                          {isOffline && (
                            <div className="absolute top-1.5 left-1.5 z-10">
                              <div className="rounded-full bg-green-500 p-1">
                                <svg
                                  className="h-2.5 w-2.5 text-white"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            </div>
                          )}
                          {book.coverUrl ? (
                            <Image
                              src={book.coverUrl}
                              alt={book.name}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <span className="text-4xl">📕</span>
                            </div>
                          )}

                          {/* Progress bar on cover */}
                          {prog &&
                            typeof prog.percent_complete === "number" &&
                            prog.percent_complete > 0 && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                                <div
                                  className="h-full bg-blue-500"
                                  style={{
                                    width: `${prog.percent_complete}%`,
                                  }}
                                />
                              </div>
                            )}

                          {/* Status badge */}
                          {status !== "not_started" && (
                            <div className="absolute top-1.5 right-1.5">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${statusColors[status]}`}
                              >
                                {statusLabels[status]}
                              </span>
                            </div>
                          )}
                          
                          {/* Format badge (PDF indicator) */}
                          {book.id.toLowerCase().endsWith(".pdf") && (
                            <div className="absolute bottom-1.5 right-1.5">
                              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                PDF
                              </span>
                            </div>
                          )}
                        </div>

                        <p className="line-clamp-2 text-sm font-medium text-zinc-800 group-hover:text-zinc-600 dark:text-zinc-200 dark:group-hover:text-zinc-400">
                          {meta?.title || book.name}
                        </p>
                        {meta?.author && (
                          <p className="line-clamp-1 text-xs text-zinc-400 mt-0.5">
                            {meta.author}
                          </p>
                        )}
                      </Link>

                      {/* Status change button + Offline button */}
                      <div className="flex items-center gap-1 mt-1">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setStatusMenuBook(
                              statusMenuBook === book.id ? null : book.id,
                            );
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        >
                          {statusLabels[status]} ▾
                        </button>

                        {/* Offline download button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            if (isOffline) {
                              handleRemoveOffline(book.id);
                            } else {
                              handleDownloadOffline(book);
                            }
                          }}
                          disabled={isDownloading}
                          className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                            isOffline
                              ? "text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                              : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                          } ${isDownloading ? "opacity-50 cursor-wait" : ""}`}
                          title={
                            isOffline
                              ? "Remove from offline"
                              : "Download for offline"
                          }
                        >
                          {isDownloading ? (
                            "⏳"
                          ) : isOffline ? (
                            "✓ Offline"
                          ) : (
                            "↓ Offline"
                          )}
                        </button>

                        {statusMenuBook === book.id && (
                          <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-lg bg-white py-1 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                            {Object.entries(statusLabels).map(
                              ([key, label]) => (
                                <button
                                  key={key}
                                  onClick={() =>
                                    handleStatusChange(book.id, key)
                                  }
                                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                                    status === key
                                      ? "font-medium text-zinc-900 dark:text-zinc-100"
                                      : "text-zinc-600 dark:text-zinc-400"
                                  }`}
                                >
                                  {status === key && "✓ "}
                                  {label}
                                </button>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List view */
              <div className="space-y-2">
                {displayBooks.map((book) => {
                  const meta = metadataMap[book.id];
                  const prog = progressMap[book.id];
                  const status = prog?.reading_status || "not_started";
                  const isOffline = offlineBooks.has(book.id);
                  const isDownloading = downloadingBooks.has(book.id);

                  return (
                    <div
                      key={book.id}
                      className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900"
                    >
                      <Link
                        href={`/reader?book=${encodeURIComponent(book.id)}`}
                        className="flex flex-1 items-center gap-4 min-w-0"
                      >
                        <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-700">
                          {book.coverUrl ? (
                            <Image
                              src={book.coverUrl}
                              alt={book.name}
                              fill
                              className="object-cover"
                              sizes="44px"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xl">
                              📕
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {meta?.title || book.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {meta?.author && (
                              <p className="text-xs text-zinc-400 truncate">
                                {meta.author}
                              </p>
                            )}
                            {meta?.publisher && (
                              <p className="text-xs text-zinc-400 truncate hidden sm:inline">
                                · {meta.publisher}
                              </p>
                            )}
                          </div>
                          {meta?.description && (
                            <p className="text-xs text-zinc-400 mt-1 line-clamp-1 hidden sm:block">
                              {meta.description}
                            </p>
                          )}
                          {prog &&
                            typeof prog.percent_complete === "number" &&
                            prog.percent_complete > 0 && (
                              <div className="mt-1.5 flex items-center gap-2">
                                <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                                  <div
                                    className="h-full rounded-full bg-blue-500"
                                    style={{
                                      width: `${prog.percent_complete}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-zinc-400">
                                  {Math.round(prog.percent_complete || 0)}%
                                </span>
                              </div>
                            )}
                        </div>
                      </Link>

                      {/* Offline + Status controls */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Offline button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            if (isOffline) {
                              handleRemoveOffline(book.id);
                            } else {
                              handleDownloadOffline(book);
                            }
                          }}
                          disabled={isDownloading}
                          className={`rounded-full p-1.5 transition-colors ${
                            isOffline
                              ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
                              : "bg-zinc-100 text-zinc-400 hover:text-zinc-600 dark:bg-zinc-800 dark:hover:text-zinc-300"
                          } ${isDownloading ? "opacity-50 cursor-wait" : ""}`}
                          title={
                            isOffline
                              ? "Remove from offline"
                              : "Download for offline"
                          }
                        >
                          {isDownloading ? (
                            <svg
                              className="h-4 w-4 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                          ) : isOffline ? (
                            <svg
                              className="h-4 w-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
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
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8"
                              />
                            </svg>
                          )}
                        </button>

                        {/* Status badge + menu */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setStatusMenuBook(
                                statusMenuBook === book.id ? null : book.id,
                              )
                            }
                            className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${statusColors[status]}`}
                          >
                            {statusLabels[status]}
                          </button>

                          {statusMenuBook === book.id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg bg-white py-1 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                              {Object.entries(statusLabels).map(
                                ([key, label]) => (
                                  <button
                                    key={key}
                                    onClick={() =>
                                      handleStatusChange(book.id, key)
                                    }
                                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                                      status === key
                                        ? "font-medium text-zinc-900 dark:text-zinc-100"
                                        : "text-zinc-600 dark:text-zinc-400"
                                    }`}
                                  >
                                    {status === key && "✓ "}
                                    {label}
                                  </button>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Click outside to close status menus */}
      {statusMenuBook && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setStatusMenuBook(null)}
        />
      )}
    </div>
  );
}
