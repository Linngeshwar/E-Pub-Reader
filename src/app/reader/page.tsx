"use client";

import { Suspense } from "react";
import ReaderView from "@/components/reader-view";

export default function ReaderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
        </div>
      }
    >
      <ReaderView />
    </Suspense>
  );
}
