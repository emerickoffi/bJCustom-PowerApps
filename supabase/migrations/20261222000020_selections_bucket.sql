insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selections', 'selections', false, 15728640, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
