-- Create reading_progress table for cross-device CFI sync
create table if not exists public.reading_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  book_id text not null,
  last_location_cfi text,
  updated_at timestamptz default now() not null,
  unique (user_id, book_id)
);

-- Enable Row Level Security
alter table public.reading_progress enable row level security;

-- Users can only read/write their own progress
create policy "Users can view own progress"
  on public.reading_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on public.reading_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.reading_progress for update
  using (auth.uid() = user_id);

-- Index for fast lookups
create index idx_reading_progress_user_book
  on public.reading_progress (user_id, book_id);

-- Storage bucket policy (run after creating the "books" bucket in the dashboard)
-- insert into storage.buckets (id, name, public) values ('books', 'books', true);
