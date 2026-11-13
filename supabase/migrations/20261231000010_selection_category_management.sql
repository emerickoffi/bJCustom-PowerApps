-- Company-wide selection category management: deactivate/reactivate and rename.
-- Additive only. Existing selections keep their category text; renaming or deactivating a
-- category never rewrites selection rows.

alter table public.selection_categories add column if not exists archived_at timestamptz;
alter table public.selection_categories add column if not exists updated_at timestamptz not null default now();

-- Only company admins may rename or (de)activate categories. Inserts stay limited to
-- managers (existing selection_categories_insert policy); reads stay limited to staff.
drop policy if exists selection_categories_update on public.selection_categories;
create policy selection_categories_update on public.selection_categories for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- organization_id must never move between companies on update.
create or replace function public.selection_categories_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'Category cannot move to another organization';
  end if;
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists selection_categories_guard on public.selection_categories;
create trigger selection_categories_guard before update on public.selection_categories
  for each row execute function public.selection_categories_guard();
