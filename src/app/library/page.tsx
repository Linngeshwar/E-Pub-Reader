"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
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

export default function LibraryPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<BookFile[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    async function fetchBooks() {
      // List files in user's folder
      const userFolder = user!.id;
      const { data, error } = await supabase.storage
        .from("books")
        .list(userFolder, {
          limit: 200,
          sortBy: { column: "name", order: "asc" },
        });

      console.log("📚 Storage list result:", { data, error, userFolder });

      if (error) {
        console.error("Error listing books:", error);
        setFetching(false);
        return;
      }

      console.log("📁 All files:", data);

      const epubs = (data || []).filter((f) =>
        f.name.toLowerCase().endsWith(".epub"),
      );

      console.log("📖 EPUB files found:", epubs);

      const mapped: BookFile[] = await Promise.all(
        epubs.map(async (f) => {
          const filePath = `${userFolder}/${f.name}`;
          const {
            data: { publicUrl },
          } = supabase.storage.from("books").getPublicUrl(filePath);

          // Check if cover exists
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
            name: f.name.replace(/\.epub$/i, ""),
            id: filePath,
            url: publicUrl,
            coverUrl,
          };
        }),
      );

      console.log("✅ Mapped books:", mapped);
      setBooks(mapped);
      setFetching(false);
    }

    fetchBooks();
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

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
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
              Upload EPUB files to your Supabase &quot;books&quot; storage
              bucket in a folder named with your user ID:{" "}
              <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                {user.id}
              </code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <Link
                key={book.id}
                href={`/reader?book=${encodeURIComponent(book.id)}`}
                className="group"
              >
                <div className="relative mb-2 aspect-2/3 overflow-hidden rounded-xl bg-linear-to-br from-zinc-200 to-zinc-300 transition-transform group-hover:scale-[1.02] dark:from-zinc-800 dark:to-zinc-700">
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
                </div>
                <p className="line-clamp-2 text-sm font-medium text-zinc-800 group-hover:text-zinc-600 dark:text-zinc-200 dark:group-hover:text-zinc-400">
                  {book.name}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
