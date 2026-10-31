-- Per-user dashboard layout preferences (Phase 5).
-- Stores only widget ids, order, and visibility. Never business data. A saved layout never grants access:
-- the application re-validates every entry against the user's current role and enabled features on read.

create table if not exists public.dashboard_layouts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dashboard_key text not null check (dashboard_key in ('owner', 'project_manager', 'builder_staff')),
  schema_version integer not null default 1 check (schema_version > 0),
  layout_configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(layout_configuration) = 'object' and pg_column_size(layout_configuration) < 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, dashboard_key)
);

alter table public.dashboard_layouts enable row level security;

-- Each user reads and writes only their own rows, and only inside an organization where they are active staff.
create policy dashboard_layouts_select on public.dashboard_layouts for select to authenticated
  using (user_id = auth.uid() and public.is_org_staff(organization_id));
create policy dashboard_layouts_insert on public.dashboard_layouts for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_staff(organization_id));
create policy dashboard_layouts_update on public.dashboard_layouts for update to authenticated
  using (user_id = auth.uid() and public.is_org_staff(organization_id))
  with check (user_id = auth.uid() and public.is_org_staff(organization_id));
create policy dashboard_layouts_delete on public.dashboard_layouts for delete to authenticated
  using (user_id = auth.uid() and public.is_org_staff(organization_id));

drop trigger if exists dashboard_layouts_updated_at on public.dashboard_layouts;
create trigger dashboard_layouts_updated_at before update on public.dashboard_layouts
  for each row execute function public.set_updated_at();
