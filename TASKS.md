# Next steps — Tasks to finish and verify

This file tracks actionable steps you should take next to configure, test, and improve the EPUB reader PWA.

- [x] Review code and project structure
- [x] Add Supabase credentials to `.env.local`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] Run the SQL migration in Supabase (see `supabase/migrations/001_reading_progress.sql`)
- [x] Create a public storage bucket named `books` in Supabase
- [ ] Run storage policies migration (`supabase/migrations/002_storage_policies.sql`)
- [ ] Upload `.epub` files to the `books` bucket in a folder named with your user ID
  - Or use the built-in Upload page at `/library/upload` after signing in
- [ ] Open the app locally: `npm run dev` and sign up / sign in
- [ ] Verify library lists uploaded EPUBs with covers
- [ ] Open a book in the reader — see cover page first, press arrow keys to start reading
- [ ] Verify CFI is restored after reload
- [ ] Test offline reading (install PWA, turn off network, open previously opened book)
- [ ] Verify progress sync between devices (sign in on two devices and move reading position)

Optional improvements / future tasks

- [x] Add cover thumbnails by extracting from EPUB metadata and storing cached images
- [x] Add chapter list / table of contents drawer in reader UI
- [x] Add per-user preferences (font size, line height, themes) and store in Supabase
- [ ] Improve EPUB caching strategies (range requests, chunking large EPUBs)
- [ ] Add end-to-end tests for reader and progress sync
- [ ] Add CI for TypeScript checks and linting

Enhanced features (migration 003)

- [x] Run `supabase/migrations/003_enhanced_features.sql` for new tables
- [x] Table of contents sidebar/drawer in reader
- [x] Progress indicator (percentage, current/total pages, chapter name)
- [x] Full-text search within current book
- [x] Dictionary/Wikipedia lookup for selected words
- [x] Text highlighting with color choices (yellow, green, blue)
- [x] Bookmarks (save/list/navigate/delete)
- [x] Annotations synced across devices via Supabase
- [x] Reading stats (session time, total time, est. time to finish)
- [x] Book metadata extraction (author, publisher, description, language)
- [x] Grid/list view toggle in library
- [x] Reading status management (Not Started, Reading, Finished, Abandoned)
- [x] Recently read / Continue Reading section on homepage and library
- [x] Sort & filter books by title, author, status, or recent
- [x] Selection toolbar (highlight + dictionary lookup)

Notes

- Migration uses `auth.users` reference and Row Level Security (RLS); ensure your Supabase auth is configured before applying migration.
- The service worker caches EPUB files accessed through Supabase public URLs to enable offline reading.
