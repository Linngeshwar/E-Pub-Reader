import { supabase } from "@/lib/supabase";

export interface BookMetadata {
  id: string;
  user_id: string;
  book_id: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  publication_date: string | null;
  description: string | null;
  language: string | null;
  cover_url: string | null;
  total_words: number;
  created_at: string;
  updated_at: string;
}

export async function getBookMetadata(
  userId: string,
  bookId: string,
): Promise<BookMetadata | null> {
  try {
    const { data, error } = await supabase
      .from("book_metadata")
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching metadata:", error);
    }
    return data as BookMetadata | null;
  } catch {
    return null;
  }
}

export async function upsertBookMetadata(
  userId: string,
  bookId: string,
  metadata: Partial<
    Omit<
      BookMetadata,
      "id" | "user_id" | "book_id" | "created_at" | "updated_at"
    >
  >,
): Promise<void> {
  try {
    const { error } = await supabase.from("book_metadata").upsert(
      {
        user_id: userId,
        book_id: bookId,
        ...metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    );

    if (error) {
      console.error("Error saving metadata:", error);
    }
  } catch (err) {
    console.error("Error saving metadata:", err);
  }
}

export async function getAllBookMetadata(
  userId: string,
): Promise<BookMetadata[]> {
  try {
    const { data, error } = await supabase
      .from("book_metadata")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching all metadata:", error);
      return [];
    }
    return (data || []) as BookMetadata[];
  } catch {
    return [];
  }
}
