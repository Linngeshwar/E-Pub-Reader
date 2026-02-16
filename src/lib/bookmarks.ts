import { supabase } from "@/lib/supabase";

export interface Bookmark {
  id: string;
  user_id: string;
  book_id: string;
  cfi: string;
  label: string | null;
  chapter: string | null;
  created_at: string;
}

export async function getBookmarks(
  userId: string,
  bookId: string,
): Promise<Bookmark[]> {
  try {
    const { data, error } = await supabase
      .from("bookmarks")
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching bookmarks:", error);
      return [];
    }
    return (data || []) as Bookmark[];
  } catch {
    return [];
  }
}

export async function addBookmark(
  userId: string,
  bookId: string,
  cfi: string,
  label?: string,
  chapter?: string,
): Promise<Bookmark | null> {
  try {
    const { data, error } = await supabase
      .from("bookmarks")
      .insert({
        user_id: userId,
        book_id: bookId,
        cfi,
        label: label || null,
        chapter: chapter || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding bookmark:", error);
      return null;
    }
    return data as Bookmark;
  } catch {
    return null;
  }
}

export async function removeBookmark(bookmarkId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("id", bookmarkId);

    if (error) {
      console.error("Error removing bookmark:", error);
    }
  } catch (err) {
    console.error("Error removing bookmark:", err);
  }
}
