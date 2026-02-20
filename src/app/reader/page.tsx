"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReaderView from "@/components/reader-view";
import PDFViewer from "@/components/pdf-viewer";

function ReaderContent() {
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book");
  
  // Detect if it's a PDF or EPUB based on file extension
  const isPDF = bookId?.toLowerCase().endsWith(".pdf") || false;
  
  return isPDF ? <PDFViewer /> : <ReaderView />;
}

export default function ReaderPage() {
  return (
    <div className="fixed inset-0 overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-white dark:bg-zinc-950">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
          </div>
        }
      >
        <ReaderContent />
      </Suspense>
    </div>
  );
}
