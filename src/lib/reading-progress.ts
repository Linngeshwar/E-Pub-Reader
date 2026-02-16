import { supabase } from "@/lib/supabase";

export interface ReadingProgress {
  id: string;
  user_id: string;
  book_id: string;
  last_location_cfi: string | null;
  updated_at: string;
  // Enhanced fields (require migration 003)
  reading_status?: string;
  percent_complete?: number;
  current_page?: number;
  total_pages?: number;
  total_reading_time_seconds?: number;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface ProgressExtra {
  reading_status?: string;
  percent_complete?: number;
  current_page?: number;
  total_pages?: number;
  total_reading_time_seconds?: number;
  started_at?: string;
  finished_at?: string;
}

export async function getProgress(
  userId: string,
  bookId: string,
): Promise<ReadingProgress | null> {
  const { data, error } = await supabase
    .from("reading_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching progress:", error);
  }
  return data as ReadingProgress | null;
}

export async function upsertProgress(
  userId: string,
  bookId: string,
  cfi: string,
  extra?: ProgressExtra,
): Promise<void> {
  const payload: Record<string, unknown> = {
    user_id: userId,
    book_id: bookId,
    last_location_cfi: cfi,
    updated_at: new Date().toISOString(),
  };

  if (extra) {
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined) payload[k] = v;
    });
  }

  const { error } = await supabase
    .from("reading_progress")
    .upsert(payload, { onConflict: "user_id,book_id" });

  if (error) {
    // If enhanced columns don't exist yet, retry with basic payload
    if (extra && error.message?.includes("column")) {
      const { error: retryError } = await supabase
        .from("reading_progress")
        .upsert(
          {
            user_id: userId,
            book_id: bookId,
            last_location_cfi: cfi,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book_id" },
        );
      if (retryError) console.error("Error saving progress:", retryError);
    } else {
      console.error("Error saving progress:", error);
    }
  }
}

export async function getRecentlyRead(
  userId: string,
  limit = 6,
): Promise<ReadingProgress[]> {
  try {
    const { data, error } = await supabase
      .from("reading_progress")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching recently read:", error);
      return [];
    }
    return (data || []) as ReadingProgress[];
  } catch {
    return [];
  }
}

export async function getAllProgress(
  userId: string,
): Promise<ReadingProgress[]> {
  try {
    const { data, error } = await supabase
      .from("reading_progress")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching all progress:", error);
      return [];
    }
    return (data || []) as ReadingProgress[];
  } catch {
    return [];
  }
}

export async function updateReadingStatus(
  userId: string,
  bookId: string,
  status: string,
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {
      reading_status: status,
      updated_at: new Date().toISOString(),
    };

    if (status === "finished") {
      updates.finished_at = new Date().toISOString();
      updates.percent_complete = 100;
    }

    const { error } = await supabase
      .from("reading_progress")
      .update(updates)
      .eq("user_id", userId)
      .eq("book_id", bookId);

    if (error) {
      console.error("Error updating status:", error);
    }
  } catch (err) {
    console.error("Error updating status:", err);
  }
}
