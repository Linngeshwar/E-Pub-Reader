"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { getRecentlyRead, type ReadingProgress } from "@/lib/reading-progress";
import { getAllBookMetadata, type BookMetadata } from "@/lib/book-metadata";
import { supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [recentBooks, setRecentBooks] = useState<
    (ReadingProgress & { meta?: BookMetadata; coverUrl?: string | null })[]
  >([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    async function fetchRecent() {
      try {
        const [progressList, metaList] = await Promise.all([
          getRecentlyRead(user!.id, 4),
          getAllBookMetadata(user!.id),
        ]);

        const metaMap: Record<string, BookMetadata> = {};
        metaList.forEach((m) => {
          metaMap[m.book_id] = m;
        });

        const enriched = await Promise.all(
          progressList.map(async (p) => {
            // Try to get cover URL
            const coverPath = `${user!.id}/.covers/${p.book_id.split("/").pop()}.jpg`;
            const { data: coverData } = await supabase.storage
              .from("books")
              .list(`${user!.id}/.covers`, {
                search: `${p.book_id.split("/").pop()}.jpg`,
              });

            let coverUrl: string | null = null;
            if (coverData && coverData.length > 0) {
              const { data: coverPublic } = supabase.storage
                .from("books")
                .getPublicUrl(coverPath);
              coverUrl = coverPublic.publicUrl;
            }

            return {
              ...p,
              meta: metaMap[p.book_id],
              coverUrl,
            };
          }),
        );

        setRecentBooks(enriched);
      } catch (err) {
        console.error("Error fetching recent books:", err);
      }
      setFetching(false);
    }

    fetchRecent();
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              📖 EPUB Reader
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Welcome back{user.email ? `, ${user.email.split("@")[0]}` : ""}
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Continue Reading section */}
        {!fetching && recentBooks.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Continue Reading
            </h2>
            <div className="space-y-3">
              {recentBooks.map((book) => (
                <Link
                  key={book.book_id}
                  href={`/reader?book=${encodeURIComponent(book.book_id)}`}
                  className="group flex gap-4 rounded-2xl bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-zinc-900"
                >
                  <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-700">
                    {book.coverUrl ? (
                      <Image
                        src={book.coverUrl}
                        alt={book.meta?.title || book.book_id}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl">
                        📕
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {book.meta?.title ||
                        book.book_id
                          .split("/")
                          .pop()
                          ?.replace(/\.epub$/i, "") ||
                        "Untitled"}
                    </p>
                    {book.meta?.author && (
                      <p className="text-sm text-zinc-400 truncate">
                        {book.meta.author}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{
                            width: `${book.percent_complete || 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {Math.round(book.percent_complete || 0)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center text-zinc-300 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400">
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
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {fetching && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/library"
            className="flex-1 rounded-2xl bg-zinc-900 px-6 py-4 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            📚 Go to Library
          </Link>
          <Link
            href="/library/upload"
            className="flex-1 rounded-2xl border border-zinc-200 bg-white px-6 py-4 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            📤 Upload Books
          </Link>
        </div>
      </div>
    </div>
  );
}
