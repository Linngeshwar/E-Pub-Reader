"use client";

import { useEffect, useState } from "react";
import {
  getBookStats,
  formatDuration,
  estimateTimeToFinish,
  type ReadingStatsData,
} from "@/lib/reading-stats";

interface StatsPanelProps {
  userId: string;
  bookId: string;
  bookTitle: string;
  percentComplete: number;
  currentSessionSeconds: number;
  totalPages: number;
  currentPage: number;
  onClose: () => void;
}

export default function StatsPanel({
  userId,
  bookId,
  bookTitle,
  percentComplete,
  currentSessionSeconds,
  totalPages,
  currentPage,
  onClose,
}: StatsPanelProps) {
  const [stats, setStats] = useState<ReadingStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBookStats(userId, bookId).then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, [userId, bookId]);

  const totalTime = (stats?.totalTimeSeconds || 0) + currentSessionSeconds;
  const eta = estimateTimeToFinish(percentComplete, totalTime);
  const pagesRemaining = totalPages - currentPage;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Reading Stats
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{bookTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-200" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Progress</span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {Math.round(percentComplete)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-zinc-900 transition-all dark:bg-zinc-100"
                  style={{ width: `${percentComplete}%` }}
                />
              </div>
              {totalPages > 0 && (
                <p className="text-xs text-zinc-400 mt-1">
                  Page {currentPage} of {totalPages} — {pagesRemaining} pages remaining
                </p>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Total Reading Time"
                value={formatDuration(totalTime)}
                icon="⏱️"
              />
              <StatCard
                label="This Session"
                value={formatDuration(currentSessionSeconds)}
                icon="📖"
              />
              <StatCard
                label="Sessions"
                value={String((stats?.totalSessions || 0) + 1)}
                icon="📅"
              />
              <StatCard
                label="Est. Time Left"
                value={eta}
                icon="🎯"
              />
              {stats && stats.averageSessionMinutes > 0 && (
                <StatCard
                  label="Avg Session"
                  value={`${Math.round(stats.averageSessionMinutes)}m`}
                  icon="📊"
                />
              )}
              {stats && stats.longestSessionSeconds > 0 && (
                <StatCard
                  label="Longest Session"
                  value={formatDuration(stats.longestSessionSeconds)}
                  icon="🏆"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
      <p className="text-lg mb-0.5">{icon}</p>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  );
}
