-- Storage policies for user-specific book folders

-- Policy: Users can read their own files
create policy "Users can read own books"
on storage.objects for select
using (
  bucket_id = 'books' 
  and auth.uid()::text = split_part(name, '/', 1)
);

-- Policy: Users can upload to their own folder
create policy "Users can upload own books"
on storage.objects for insert
with check (
  bucket_id = 'books' 
  and auth.uid()::text = split_part(name, '/', 1)
);

-- Policy: Users can update their own files
create policy "Users can update own books"
on storage.objects for update
using (
  bucket_id = 'books' 
  and auth.uid()::text = split_part(name, '/', 1)
);

-- Policy: Users can delete their own files
create policy "Users can delete own books"
on storage.objects for delete
using (
  bucket_id = 'books' 
  and auth.uid()::text = split_part(name, '/', 1)
);
