-- Retry-safe selection creation from the New Selection drawer.
-- Each drawer entry carries a client-generated key; a repeated submit hits the unique
-- index and is ignored instead of creating a duplicate. Additive and nullable, so
-- existing rows and other insert paths are unaffected.
alter table public.selections add column if not exists request_key uuid;

create unique index if not exists selections_org_request_key_key
  on public.selections (organization_id, request_key);
