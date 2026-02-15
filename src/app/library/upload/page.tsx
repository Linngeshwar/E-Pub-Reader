"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UploadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string[]>([]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
      </div>
    );
  }

  if (!user) {
    router.replace("/auth");
    return null;
  }

  async function extractCover(file: File) {
    try {
      const ePub = (await import("epubjs")).default;
      const arrayBuffer = await file.arrayBuffer();
      const book = ePub(arrayBuffer);
      const coverUrl = (await book.coverUrl()) as string | null;
      if (!coverUrl) {
        book.destroy();
        return null;
      }
      const response = await fetch(coverUrl);
      const blob = await response.blob();
      book.destroy();
      const extension = blob.type.split("/")[1] || "jpg";
      return { blob, extension };
    } catch (err) {
      console.warn("No cover found during upload:", err);
      return null;
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    setSuccess([]);

    const uploaded: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.toLowerCase().endsWith(".epub")) {
        setError(`Skipped ${file.name}: not an EPUB file`);
        continue;
      }

      try {
        const filePath = `${user!.id}/${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from("books")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const coverAsset = await extractCover(file);
        if (coverAsset) {
          const coverPath = `${user!.id}/.covers/${file.name}.cover.${coverAsset.extension}`;
          const { error: coverError } = await supabase.storage
            .from("books")
            .upload(coverPath, coverAsset.blob, {
              cacheControl: "3600",
              upsert: true,
              contentType: coverAsset.blob.type || "image/jpeg",
            });
          if (coverError) {
            console.warn("Cover upload failed for", file.name, coverError);
          }
        }

        uploaded.push(file.name);
        setProgress(((i + 1) / files.length) * 100);
      } catch (err: unknown) {
        console.error("Upload error:", err);
        setError(`Failed to upload ${file.name}: ${(err as Error).message}`);
      }
    }

    setSuccess(uploaded);
    setUploading(false);
    setProgress(0);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            📤 Upload Books
          </h1>
          <Link
            href="/library"
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Back to Library
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-900">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Upload EPUB Files
          </h2>
          <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
            Select one or more EPUB files to upload to your library. Files will
            be stored in your personal folder.
          </p>

          <div className="mb-6">
            <label
              htmlFor="epub-upload"
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-12 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
            >
              <svg
                className="mb-3 h-12 w-12 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Click to upload EPUB files
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                or drag and drop
              </span>
            </label>
            <input
              id="epub-upload"
              type="file"
              accept=".epub"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </div>

          {uploading && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Uploading...
                </span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {success.length > 0 && (
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <h3 className="mb-2 text-sm font-medium text-green-900 dark:text-green-100">
                ✓ Successfully uploaded {success.length} file(s):
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-green-700 dark:text-green-300">
                {success.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <Link
                href="/library"
                className="mt-4 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
              >
                Go to Library
              </Link>
            </div>
          )}

          <div className="mt-6 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              📝 Note
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Books will be uploaded to: <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">{user.id}/</code>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
