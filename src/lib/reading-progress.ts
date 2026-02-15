import { supabase } from "@/lib/supabase";

export interface ReadingProgress {
  id: string;
  user_id: string;
  book_id: string;
  last_location_cfi: string | null;
  updated_at: string;
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
): Promise<void> {
  const { error } = await supabase.from("reading_progress").upsert(
    {
      user_id: userId,
      book_id: bookId,
      last_location_cfi: cfi,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,book_id" },
  );

  if (error) {
    console.error("Error saving progress:", error);
  }
}
