-- Geocoded construction-site coordinates for the Projects List + Map view.
-- Kept beside projects (not on it) so caching a coordinate never bumps projects.updated_at or the
-- "Recently updated" sort. `address_key` is the normalized site address that was geocoded: when the
-- project's address changes the key no longer matches and the site is geocoded again; an unchanged
-- address is never sent to the geocoder twice. Only the site address is ever geocoded.
create table if not exists public.project_site_locations (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  address_key text not null check (char_length(address_key) <= 400),
  status text not null check (status in ('ok', 'unresolved', 'ambiguous', 'failed')),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  geocoded_at timestamptz not null default now(),
  check ((status = 'ok') = (latitude is not null and longitude is not null))
);

create index if not exists project_site_locations_org_idx on public.project_site_locations (organization_id);

alter table public.project_site_locations enable row level security;

-- Readable exactly where the project itself is readable by staff; homeowner and subcontractor
-- portals have no access. There are no insert/update/delete policies: rows are written only by the
-- server after it has authorized the caller's access to each project.
drop policy if exists project_site_locations_select on public.project_site_locations;
create policy project_site_locations_select on public.project_site_locations
  for select to authenticated
  using (public.is_org_staff(organization_id) and public.can_view_project_internal(project_id));
