/// <reference lib="webworker" />

const CACHE_NAME = "epub-reader-v2";
const OFFLINE_URLS = ["/", "/library", "/auth", "/reader"];
const DB_NAME = "EpubReaderOffline";
const DB_VERSION = 1;
const STORE_NAME = "books";

// IndexedDB helper for service worker
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "bookId" });
        store.createIndex("title", "title", { unique: false });
        store.createIndex("downloadedAt", "downloadedAt", { unique: false });
      }
    };
  });
}

// Get book from IndexedDB by URL
async function getBookFromIndexedDB(url) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    // Extract book ID from URL pattern
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    const bookIndex = pathParts.findIndex((part) => part === "books");
    if (bookIndex === -1) return null;

    // Reconstruct the book ID (user_id/filename.epub)
    const bookId = pathParts.slice(bookIndex + 2).join("/");

    return new Promise((resolve) => {
      const request = store.get(bookId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.error("Error getting book from IndexedDB:", error);
    return null;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Handle messages from clients
self.addEventListener("message", (event) => {
  const { type, bookId } = event.data;

  if (type === "BOOK_DOWNLOADED") {
    console.log(`Book downloaded for offline: ${bookId}`);
    // Optionally pre-cache related resources
  } else if (type === "BOOK_REMOVED") {
    console.log(`Book removed from offline: ${bookId}`);
  } else if (type === "ALL_BOOKS_CLEARED") {
    console.log("All offline books cleared");
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || request.url.startsWith("chrome-extension"))
    return;

  // For navigation requests, try network first then cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // For EPUB files, try IndexedDB first, then cache, then network
  if (request.url.includes("/storage/") && request.url.includes(".epub")) {
    event.respondWith(
      (async () => {
        try {
          // 1. Try IndexedDB (offline-first for downloaded books)
          const offlineBook = await getBookFromIndexedDB(request.url);
          if (offlineBook && offlineBook.blob) {
            console.log("Serving book from IndexedDB (offline)");
            return new Response(offlineBook.blob, {
              status: 200,
              statusText: "OK",
              headers: {
                "Content-Type": "application/epub+zip",
                "Content-Length": offlineBook.blob.size.toString(),
                "X-Offline-Source": "indexeddb",
              },
            });
          }

          // 2. Try cache
          const cached = await caches.match(request);
          if (cached) {
            console.log("Serving book from cache");
            return cached;
          }

          // 3. Try network and update cache
          const response = await fetch(request);
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        } catch (error) {
          console.error("Error serving book:", error);
          // Fallback to cache one more time
          const cached = await caches.match(request);
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  // For other assets, stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    }),
  );
});
