-- Migration 003: Enhanced features (TOC, stats, bookmarks, annotations, metadata, reading status)

-- Extend reading_progress with status, progress tracking, and reading time
ALTER TABLE public.reading_progress
  ADD COLUMN IF NOT EXISTS reading_status text DEFAULT 'not_started'
    CHECK (reading_status IN ('not_started', 'reading', 'finished', 'abandoned')),
  ADD COLUMN IF NOT EXISTS percent_complete numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_page integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reading_time_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Book metadata table (cached from EPUB extraction)
CREATE TABLE IF NOT EXISTS public.book_metadata (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id text NOT NULL,
  title text,
  author text,
  publisher text,
  publication_date text,
  description text,
  language text,
  cover_url text,
  total_words integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, book_id)
);

ALTER TABLE public.book_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metadata"
  ON public.book_metadata FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metadata"
  ON public.book_metadata FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metadata"
  ON public.book_metadata FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_book_metadata_user_book
  ON public.book_metadata (user_id, book_id);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id text NOT NULL,
  cfi text NOT NULL,
  label text,
  chapter text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
  ON public.bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks"
  ON public.bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON public.bookmarks FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_bookmarks_user_book
  ON public.bookmarks (user_id, book_id);

-- Annotations (highlights + notes)
CREATE TABLE IF NOT EXISTS public.annotations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id text NOT NULL,
  cfi_range text NOT NULL,
  text text NOT NULL,
  note text,
  color text DEFAULT 'yellow',
  chapter text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own annotations"
  ON public.annotations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own annotations"
  ON public.annotations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own annotations"
  ON public.annotations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own annotations"
  ON public.annotations FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_annotations_user_book
  ON public.annotations (user_id, book_id);

-- Reading sessions for detailed stats tracking
CREATE TABLE IF NOT EXISTS public.reading_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id text NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  duration_seconds integer DEFAULT 0,
  pages_read integer DEFAULT 0,
  start_cfi text,
  end_cfi text
);

ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON public.reading_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.reading_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.reading_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_reading_sessions_user_book
  ON public.reading_sessions (user_id, book_id);
