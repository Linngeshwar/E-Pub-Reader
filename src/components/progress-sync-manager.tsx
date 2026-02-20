"use client";

import { useEffect } from "react";
import { setupAutoSync } from "@/lib/progress-sync";

/**
 * Progress Sync Manager - Sets up automatic sync for offline progress
 */
export function ProgressSyncManager() {
  useEffect(() => {
    setupAutoSync();
  }, []);

  return null;
}
