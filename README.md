# EPUB Reader (Next.js + Supabase)

A minimalist, cross-platform EPUB reader PWA built with Next.js, TypeScript, Tailwind CSS, epub.js and Supabase. It synchronizes reading progress (CFI) across devices using Supabase Auth and a `reading_progress` table.

## Features

- Sign up / sign in with Supabase Auth (email/password)
- Library view that lists `.epub` files stored in a Supabase `books` storage bucket
- EPUB rendering with `epub.js` and a minimalist reader UI (tap to toggle header, edge taps for navigation)
- Reading progress saved as CFI to Supabase every 10s and on page hide; also cached to `localStorage` for offline restore
- PWA installable (`manifest.json`) and a basic service worker that caches pages and EPUB files for offline reading

## Quickstart

1. Install dependencies:

```bash
npm install
```

2. Add Supabase credentials to `.env.local` (file already present with placeholders):

- `NEXT_PUBLIC_SUPABASE_URL` (your Supabase project URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (your anon/public key)

3. Run the SQL migration in your Supabase project (see `supabase/migrations/001_reading_progress.sql`). The migration creates the `reading_progress` table and RLS policies.

4. Create a public storage bucket named `books` in the Supabase dashboard and upload `.epub` files.

5. Start the dev server:

```bash
npm run dev
```

6. Open the app at http://localhost:3000 — create an account and visit the Library to open a book.

## Important files

- `supabase/migrations/001_reading_progress.sql` — SQL migration for `reading_progress` with RLS
- `src/lib/supabase.ts` — Supabase client
- `src/lib/auth-context.tsx` — React context wrapper for Supabase auth
- `src/lib/reading-progress.ts` — helpers: `getProgress`, `upsertProgress`
- `src/app/library/page.tsx` — Library UI, lists books from Supabase Storage
- `src/components/reader-view.tsx` — epub.js reader with CFI restore/save logic
- `public/manifest.json` and `public/sw.js` — PWA manifest and service worker

## How progress sync works

- When a user reads a book the app tracks the current CFI (location).
- The reader saves the CFI to Supabase every 10 seconds and when the page visibility changes to `hidden`.
- On load the reader attempts to fetch the last CFI for the current user+book from Supabase. If absent, it falls back to a local `localStorage` cached CFI.

## PWA and offline

- The service worker caches visited pages and EPUB files (accessed via Supabase public URLs) so that previously opened books can be read offline.
- To test PWA behavior: install the app on your device or open Chrome DevTools → Application → Service Workers and test offline navigation.

## Next steps / roadmap

See `TASKS.md` for recommended next steps (migration, uploading books, testing offline, feature ideas).

## Troubleshooting

- If EPUBs do not appear in the Library, ensure the `books` bucket exists and files are public (or the public URL retrieval is working).
- If progress is not saved: verify `.env.local` values and that RLS policies in Supabase allow the authenticated user to insert/update their rows (the migration adds these RLS policies).

## License

This repository contains example code. Add your own license if you plan to distribute.

---
Generated and scaffolded by a developer assistant — edit as needed.
