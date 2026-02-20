"use client";

/**
 * Offline Books Manager using IndexedDB
 * Stores EPUB files locally for offline access
 */

const DB_NAME = "EpubReaderOffline";
const DB_VERSION = 1;
const STORE_NAME = "books";

export interface OfflineBook {
  bookId: string; // Unique identifier (filepath)
  title: string;
  blob: Blob;
  downloadedAt: string;
  size: number;
}

// Initialize the database
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "bookId" });
        store.createIndex("title", "title", { unique: false });
        store.createIndex("downloadedAt", "downloadedAt", { unique: false });
      }
    };
  });
}

/**
 * Download a book for offline access
 */
export async function downloadBookOffline(
  bookId: string,
  title: string,
  url: string,
): Promise<void> {
  try {
    // Fetch the book
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch book: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Store in IndexedDB
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const offlineBook: OfflineBook = {
      bookId,
      title,
      blob,
      downloadedAt: new Date().toISOString(),
      size: blob.size,
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(offlineBook);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Notify service worker to update cache manifest
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "BOOK_DOWNLOADED",
        bookId,
      });
    }
  } catch (error) {
    console.error("Error downloading book offline:", error);
    throw error;
  }
}

/**
 * Remove a book from offline storage
 */
export async function removeBookOffline(bookId: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(bookId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Notify service worker
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "BOOK_REMOVED",
        bookId,
      });
    }
  } catch (error) {
    console.error("Error removing offline book:", error);
    throw error;
  }
}

/**
 * Check if a book is available offline
 */
export async function isBookOffline(bookId: string): Promise<boolean> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const result = await new Promise<boolean>((resolve) => {
      const request = store.get(bookId);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    });

    db.close();
    return result;
  } catch (error) {
    console.error("Error checking offline book:", error);
    return false;
  }
}

/**
 * Get a book from offline storage
 */
export async function getOfflineBook(
  bookId: string,
): Promise<OfflineBook | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const result = await new Promise<OfflineBook | null>((resolve) => {
      const request = store.get(bookId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });

    db.close();
    return result;
  } catch (error) {
    console.error("Error getting offline book:", error);
    return null;
  }
}

/**
 * Get all offline books
 */
export async function getAllOfflineBooks(): Promise<OfflineBook[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const result = await new Promise<OfflineBook[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return result;
  } catch (error) {
    console.error("Error getting all offline books:", error);
    return [];
  }
}

/**
 * Get total size of offline books in bytes
 */
export async function getOfflineStorageSize(): Promise<number> {
  const books = await getAllOfflineBooks();
  return books.reduce((total, book) => total + book.size, 0);
}

/**
 * Clear all offline books
 */
export async function clearAllOfflineBooks(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Notify service worker
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "ALL_BOOKS_CLEARED",
      });
    }
  } catch (error) {
    console.error("Error clearing offline books:", error);
    throw error;
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
