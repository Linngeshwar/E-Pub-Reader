import { supabase } from "@/lib/supabase";

export interface Annotation {
  id: string;
  user_id: string;
  book_id: string;
  cfi_range: string;
  text: string;
  note: string | null;
  color: string;
  chapter: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAnnotations(
  userId: string,
  bookId: string,
): Promise<Annotation[]> {
  try {
    const { data, error } = await supabase
      .from("annotations")
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching annotations:", error);
      return [];
    }
    return (data || []) as Annotation[];
  } catch {
    return [];
  }
}

export async function addAnnotation(
  userId: string,
  bookId: string,
  cfiRange: string,
  text: string,
  note?: string,
  color?: string,
  chapter?: string,
): Promise<Annotation | null> {
  try {
    const { data, error } = await supabase
      .from("annotations")
      .insert({
        user_id: userId,
        book_id: bookId,
        cfi_range: cfiRange,
        text,
        note: note || null,
        color: color || "yellow",
        chapter: chapter || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding annotation:", error);
      return null;
    }
    return data as Annotation;
  } catch {
    return null;
  }
}

export async function updateAnnotation(
  annotationId: string,
  updates: { note?: string; color?: string },
): Promise<void> {
  try {
    const { error } = await supabase
      .from("annotations")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", annotationId);

    if (error) {
      console.error("Error updating annotation:", error);
    }
  } catch (err) {
    console.error("Error updating annotation:", err);
  }
}

export async function removeAnnotation(annotationId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("annotations")
      .delete()
      .eq("id", annotationId);

    if (error) {
      console.error("Error removing annotation:", error);
    }
  } catch (err) {
    console.error("Error removing annotation:", err);
  }
}
