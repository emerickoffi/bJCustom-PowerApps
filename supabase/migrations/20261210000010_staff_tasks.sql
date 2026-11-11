-- Personal staff to-dos shown on the dashboard's My to-dos card and in its task drawer.
-- A task is always assigned to its creator. An optional project link is only allowed for a project the user can
-- view internally, and a task linked to a project the user later loses access to stays hidden from them.

create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  project_id uuid references public.projects(id) on delete set null,
  assigned_to uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  due_date date,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_tasks_completion_consistent check ((completed_at is null) = (completed_by is null))
);

create index if not exists staff_tasks_open_by_assignee
  on public.staff_tasks (organization_id, assigned_to, due_date)
  where completed_at is null;

create index if not exists staff_tasks_completed_by_assignee
  on public.staff_tasks (organization_id, assigned_to, completed_at desc)
  where completed_at is not null;

create or replace function public.staff_task_project_allowed(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_project is null or exists (
    select 1 from public.projects p
    where p.id = p_project and p.organization_id = p_org and public.can_view_project_internal(p.id)
  );
$$;

alter table public.staff_tasks enable row level security;

drop policy if exists staff_tasks_select on public.staff_tasks;
create policy staff_tasks_select on public.staff_tasks
  for select to authenticated
  using (
    public.is_org_staff(organization_id)
    and assigned_to = auth.uid()
    and public.staff_task_project_allowed(organization_id, project_id)
  );

drop policy if exists staff_tasks_insert on public.staff_tasks;
create policy staff_tasks_insert on public.staff_tasks
  for insert to authenticated
  with check (
    public.is_org_staff(organization_id)
    and assigned_to = auth.uid()
    and created_by = auth.uid()
    and completed_at is null
    and public.staff_task_project_allowed(organization_id, project_id)
  );

drop policy if exists staff_tasks_update on public.staff_tasks;
create policy staff_tasks_update on public.staff_tasks
  for update to authenticated
  using (
    public.is_org_staff(organization_id)
    and assigned_to = auth.uid()
    and public.staff_task_project_allowed(organization_id, project_id)
  )
  with check (
    public.is_org_staff(organization_id)
    and assigned_to = auth.uid()
    and (completed_by is null or completed_by = auth.uid())
    and public.staff_task_project_allowed(organization_id, project_id)
  );

-- Ownership columns are fixed after insert; only the task content and completion state can change.
revoke update on public.staff_tasks from authenticated, anon;
grant select, insert on public.staff_tasks to authenticated;
grant update (title, project_id, due_date, completed_at, completed_by, updated_at) on public.staff_tasks to authenticated;
revoke delete on public.staff_tasks from authenticated, anon;
