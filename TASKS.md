# Next steps — Tasks to finish and verify

This file tracks actionable steps you should take next to configure, test, and improve the EPUB reader PWA.

- [x] Review code and project structure
- [ ] Add Supabase credentials to `.env.local`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Run the SQL migration in Supabase (see `supabase/migrations/001_reading_progress.sql`)
- [ ] Create a public storage bucket named `books` in Supabase
- [ ] Upload `.epub` files to the `books` bucket
- [ ] Open the app locally: `npm run dev` and sign up / sign in
- [ ] Verify library lists uploaded EPUBs
- [ ] Open a book in the reader and verify CFI is restored after reload
- [ ] Test offline reading (install PWA, turn off network, open previously opened book)
- [ ] Verify progress sync between devices (sign in on two devices and move reading position)

Optional improvements / future tasks

- [ ] Add cover thumbnails by extracting from EPUB metadata and storing cached images
- [ ] Add chapter list / table of contents drawer in reader UI
- [ ] Add per-user preferences (font size, line height, themes) and store in Supabase
- [ ] Improve EPUB caching strategies (range requests, chunking large EPUBs)
- [ ] Add end-to-end tests for reader and progress sync
- [ ] Add CI for TypeScript checks and linting

Notes

- Migration uses `auth.users` reference and Row Level Security (RLS); ensure your Supabase auth is configured before applying migration.
- The service worker caches EPUB files accessed through Supabase public URLs to enable offline reading.
