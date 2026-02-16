import { supabase } from "@/lib/supabase";

export interface ReadingSession {
  id: string;
  user_id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  pages_read: number;
  start_cfi: string | null;
  end_cfi: string | null;
}

export interface ReadingStatsData {
  totalTimeSeconds: number;
  totalSessions: number;
  totalPagesRead: number;
  averageSessionMinutes: number;
  longestSessionSeconds: number;
}

export async function createSession(
  userId: string,
  bookId: string,
  startCfi?: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("reading_sessions")
      .insert({
        user_id: userId,
        book_id: bookId,
        start_cfi: startCfi || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating session:", error);
      return null;
    }
    return data?.id || null;
  } catch {
    return null;
  }
}

export async function endSession(
  sessionId: string,
  durationSeconds: number,
  pagesRead: number,
  endCfi?: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("reading_sessions")
      .update({
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        pages_read: pagesRead,
        end_cfi: endCfi || null,
      })
      .eq("id", sessionId);

    if (error) {
      console.error("Error ending session:", error);
    }
  } catch (err) {
    console.error("Error ending session:", err);
  }
}

export async function getBookStats(
  userId: string,
  bookId: string,
): Promise<ReadingStatsData> {
  const empty: ReadingStatsData = {
    totalTimeSeconds: 0,
    totalSessions: 0,
    totalPagesRead: 0,
    averageSessionMinutes: 0,
    longestSessionSeconds: 0,
  };

  try {
    const { data, error } = await supabase
      .from("reading_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .order("started_at", { ascending: false });

    if (error || !data) return empty;

    const sessions = data as ReadingSession[];
    const totalTimeSeconds = sessions.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0,
    );
    const totalPagesRead = sessions.reduce(
      (sum, s) => sum + (s.pages_read || 0),
      0,
    );
    const longestSessionSeconds = Math.max(
      0,
      ...sessions.map((s) => s.duration_seconds || 0),
    );
    const averageSessionMinutes =
      sessions.length > 0 ? totalTimeSeconds / 60 / sessions.length : 0;

    return {
      totalTimeSeconds,
      totalSessions: sessions.length,
      totalPagesRead,
      averageSessionMinutes,
      longestSessionSeconds,
    };
  } catch {
    return empty;
  }
}

export async function getAllStats(userId: string): Promise<ReadingStatsData> {
  const empty: ReadingStatsData = {
    totalTimeSeconds: 0,
    totalSessions: 0,
    totalPagesRead: 0,
    averageSessionMinutes: 0,
    longestSessionSeconds: 0,
  };

  try {
    const { data, error } = await supabase
      .from("reading_sessions")
      .select("*")
      .eq("user_id", userId);

    if (error || !data) return empty;

    const sessions = data as ReadingSession[];
    const totalTimeSeconds = sessions.reduce(
      (sum, s) => sum + (s.duration_seconds || 0),
      0,
    );
    const totalPagesRead = sessions.reduce(
      (sum, s) => sum + (s.pages_read || 0),
      0,
    );
    const longestSessionSeconds = Math.max(
      0,
      ...sessions.map((s) => s.duration_seconds || 0),
    );
    const averageSessionMinutes =
      sessions.length > 0 ? totalTimeSeconds / 60 / sessions.length : 0;

    return {
      totalTimeSeconds,
      totalSessions: sessions.length,
      totalPagesRead,
      averageSessionMinutes,
      longestSessionSeconds,
    };
  } catch {
    return empty;
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

export function estimateTimeToFinish(
  percentComplete: number,
  totalTimeSeconds: number,
): string {
  if (percentComplete <= 0 || totalTimeSeconds <= 0) return "Unknown";
  const remainingPercent = 100 - percentComplete;
  const secondsPerPercent = totalTimeSeconds / percentComplete;
  const remainingSeconds = remainingPercent * secondsPerPercent;
  return formatDuration(Math.round(remainingSeconds));
}
