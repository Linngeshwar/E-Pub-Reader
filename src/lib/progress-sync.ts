"use client";

/**
 * Progress Sync Queue
 * Handles offline progress tracking and syncs to cloud when online
 */

import { upsertProgress } from "./reading-progress";

const DB_NAME = "EpubReaderSync";
const DB_VERSION = 1;
const STORE_NAME = "progressQueue";

interface QueuedProgress {
  id: string; // composite key: userId:bookId:timestamp
  userId: string;
  bookId: string;
  cfi: string;
  metadata: {
    reading_status: string;
    percent_complete: number;
    current_page: number;
    total_pages: number;
  };
  timestamp: string;
  retryCount: number;
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
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("bookId", "bookId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

/**
 * Save progress with automatic offline queue
 */
export async function saveProgressWithSync(
  userId: string,
  bookId: string,
  cfi: string,
  metadata: {
    reading_status: string;
    percent_complete: number;
    current_page: number;
    total_pages: number;
  },
): Promise<{ success: boolean; queued: boolean }> {
  // Always save to localStorage immediately
  localStorage.setItem(`cfi:${bookId}`, cfi);
  localStorage.setItem(`progress:${bookId}`, JSON.stringify(metadata));

  // Try to save to cloud
  try {
    await upsertProgress(userId, bookId, cfi, metadata);
    console.log("Progress saved to cloud");
    return { success: true, queued: false };
  } catch (error) {
    console.warn("Cloud save failed, queueing for sync:", error);

    // Queue for later sync
    const queueItem: QueuedProgress = {
      id: `${userId}:${bookId}:${Date.now()}`,
      userId,
      bookId,
      cfi,
      metadata,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    try {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.put(queueItem);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      db.close();
      console.log("Progress queued for sync");
      return { success: true, queued: true };
    } catch (queueError) {
      console.error("Failed to queue progress:", queueError);
      return { success: false, queued: false };
    }
  }
}

/**
 * Get all queued progress items
 */
export async function getQueuedProgress(): Promise<QueuedProgress[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const result = await new Promise<QueuedProgress[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return result;
  } catch (error) {
    console.error("Error getting queued progress:", error);
    return [];
  }
}

/**
 * Get queued progress count for a specific user
 */
export async function getQueuedCount(userId: string): Promise<number> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("userId");

    const result = await new Promise<number>((resolve, reject) => {
      const request = index.count(IDBKeyRange.only(userId));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return result;
  } catch (error) {
    console.error("Error getting queued count:", error);
    return 0;
  }
}

/**
 * Sync all queued progress to cloud
 */
export async function syncQueuedProgress(): Promise<{
  synced: number;
  failed: number;
}> {
  const queue = await getQueuedProgress();
  let synced = 0;
  let failed = 0;

  console.log(`Syncing ${queue.length} queued progress items...`);

  for (const item of queue) {
    try {
      await upsertProgress(item.userId, item.bookId, item.cfi, item.metadata);
      await removeFromQueue(item.id);
      synced++;
      console.log(`Synced progress for book: ${item.bookId}`);
    } catch (error) {
      console.error(`Failed to sync progress for book ${item.bookId}:`, error);

      // Update retry count
      if (item.retryCount < 5) {
        await updateRetryCount(item.id, item.retryCount + 1);
      } else {
        // After 5 retries, give up and remove
        await removeFromQueue(item.id);
        console.warn(`Gave up syncing after 5 retries: ${item.bookId}`);
      }
      failed++;
    }
  }

  console.log(`Sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

/**
 * Remove an item from the queue
 */
async function removeFromQueue(id: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  } catch (error) {
    console.error("Error removing from queue:", error);
  }
}

/**
 * Update retry count for a queued item
 */
async function updateRetryCount(id: string, retryCount: number): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const item = await new Promise<QueuedProgress | undefined>(
      (resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );

    if (item) {
      item.retryCount = retryCount;
      await new Promise<void>((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    db.close();
  } catch (error) {
    console.error("Error updating retry count:", error);
  }
}

/**
 * Clear all queued progress (use with caution)
 */
export async function clearQueue(): Promise<void> {
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
    console.log("Progress queue cleared");
  } catch (error) {
    console.error("Error clearing queue:", error);
  }
}

/**
 * Setup automatic sync when online
 */
export function setupAutoSync() {
  if (typeof window === "undefined") return;

  // Sync when coming back online
  window.addEventListener("online", async () => {
    console.log("Back online - syncing progress...");
    await syncQueuedProgress();
  });

  // Also try to sync on visibility change (when user comes back to tab)
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      const queue = await getQueuedProgress();
      if (queue.length > 0) {
        console.log("Tab visible and online - syncing pending progress...");
        await syncQueuedProgress();
      }
    }
  });

  // Periodic sync every 5 minutes if online and has items
  setInterval(async () => {
    if (navigator.onLine) {
      const queue = await getQueuedProgress();
      if (queue.length > 0) {
        console.log("Periodic sync check - syncing pending progress...");
        await syncQueuedProgress();
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
}
