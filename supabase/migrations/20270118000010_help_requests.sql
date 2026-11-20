-- Help requests: the ? button on every screen lets people contact Trefort support from where they are stuck.
--
-- * Signed-in builders, homeowners and subcontractors file through create_support_ticket(), which takes their
--   name, email and company from the session, not from the form.
-- * People who cannot sign in yet (for example a subcontractor looking for an invitation) file through
--   create_public_support_ticket(). Only the server (service role) can call it, and it is rate limited per
--   network address.
-- * A company admin filing from a project can also let support view that project for an hour, using the
--   support access grant (20270117000010_support_access.sql) with this ticket's number.
-- * Trefort reads and closes tickets in the owner console through platform_* functions.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity (start with 1001) unique,
  reference text generated always as ('HELP-' || ticket_number::text) stored,
  organization_id uuid references public.organizations (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  requester_name text,
  requester_email text not null,
  requester_role text,
  area text not null,
  subject text not null,
  message text not null,
  page_path text,
  user_agent text,
  last_error text,
  context jsonb not null default '{}'::jsonb,
  support_access_grant_id uuid references public.support_access_grants (id) on delete set null,
  status text not null default 'open',
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  ip_hash text,
  email_status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint support_tickets_area check (area in ('staff', 'portal', 'sub', 'public')),
  constraint support_tickets_status check (status in ('open', 'closed')),
  constraint support_tickets_email_status check (email_status in ('pending', 'sent', 'failed', 'not_configured')),
  constraint support_tickets_subject_length check (char_length(btrim(subject)) between 3 and 140),
  constraint support_tickets_message_length check (char_length(btrim(message)) between 10 and 4000),
  constraint support_tickets_email_length check (char_length(requester_email) between 3 and 254),
  constraint support_tickets_small_fields check (
    coalesce(char_length(requester_name), 0) <= 120 and coalesce(char_length(page_path), 0) <= 500
    and coalesce(char_length(user_agent), 0) <= 500 and coalesce(char_length(last_error), 0) <= 1000
    and coalesce(char_length(requester_role), 0) <= 40 and pg_column_size(context) <= 8000
  )
);

create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_ip_idx on public.support_tickets (ip_hash, created_at desc) where ip_hash is not null;

alter table public.support_tickets enable row level security;
drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own on public.support_tickets
  for select to authenticated using (user_id = auth.uid());
-- No insert, update or delete policies: tickets are written only by the functions below.

revoke all on public.support_tickets from anon;
revoke insert, update, delete, truncate on public.support_tickets from authenticated;
grant select on public.support_tickets to authenticated;

-- ───────── Filing a request ─────────

create or replace function public.create_support_ticket(
  p_area text,
  p_subject text,
  p_message text,
  p_organization uuid default null,
  p_project uuid default null,
  p_page_path text default null,
  p_user_agent text default null,
  p_last_error text default null,
  p_context jsonb default '{}'::jsonb,
  p_grant_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_org uuid;
  v_role text;
  v_project uuid;
  v_ticket public.support_tickets;
  v_grant uuid;
  v_grant_error text;
begin
  if v_uid is null then
    raise exception 'Sign in to send a help request' using errcode = '42501';
  end if;
  if coalesce(p_area, '') not in ('staff', 'portal', 'sub') then
    raise exception 'Unknown area';
  end if;
  if (select count(*) from public.support_tickets t where t.user_id = v_uid and t.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You have sent several help requests in the last hour. We will reply to those first';
  end if;

  select u.email::text into v_email from auth.users u where u.id = v_uid;
  select p.full_name into v_name from public.profiles p where p.id = v_uid;

  -- Keep the company only if the person really belongs to it (team, homeowner or subcontractor).
  if p_organization is not null then
    select m.role::text into v_role
    from public.organization_memberships m
    where m.organization_id = p_organization and m.user_id = v_uid and m.status = 'active'
    limit 1;
    if v_role is null and exists (
      select 1 from public.subcontractor_portal_accounts a
      where a.organization_id = p_organization and a.user_id = v_uid and a.status = 'active'
    ) then
      v_role := 'subcontractor';
    end if;
    if v_role is not null then v_org := p_organization; end if;
  end if;

  if v_org is not null and p_project is not null then
    select p.id into v_project from public.projects p where p.id = p_project and p.organization_id = v_org;
  end if;

  insert into public.support_tickets
    (organization_id, project_id, user_id, requester_name, requester_email, requester_role, area,
     subject, message, page_path, user_agent, last_error, context)
  values
    (v_org, v_project, v_uid, left(v_name, 120), coalesce(v_email, 'unknown'), v_role, p_area,
     left(btrim(coalesce(p_subject, '')), 140), left(btrim(coalesce(p_message, '')), 4000),
     left(p_page_path, 500), left(p_user_agent, 500), left(p_last_error, 1000), coalesce(p_context, '{}'::jsonb))
  returning * into v_ticket;

  -- Optional: a company admin lets support view this project, tied to this ticket. A failure here (not an
  -- admin, access already open) never loses the request itself.
  if p_grant_minutes is not null and v_project is not null then
    begin
      v_grant := public.support_grant_access(v_project, v_ticket.reference, 'Granted from help request', p_grant_minutes);
      update public.support_tickets set support_access_grant_id = v_grant where id = v_ticket.id;
    exception when others then
      v_grant_error := sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'id', v_ticket.id,
    'reference', v_ticket.reference,
    'requester_email', v_ticket.requester_email,
    'grant_id', v_grant,
    'grant_error', v_grant_error
  );
end $$;

-- Server only (service role): the request comes from someone who is not signed in. The caller passes a
-- hash of the network address so repeated requests can be limited without storing the address itself.
create or replace function public.create_public_support_ticket(
  p_name text,
  p_email text,
  p_subject text,
  p_message text,
  p_page_path text default null,
  p_user_agent text default null,
  p_last_error text default null,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ticket public.support_tickets;
begin
  if v_email !~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address so we can reply';
  end if;
  if p_ip_hash is not null and (select count(*) from public.support_tickets t
      where t.ip_hash = p_ip_hash and t.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many help requests from this network. Try again in an hour, or email support@trefortpro.com';
  end if;
  if (select count(*) from public.support_tickets t where t.area = 'public' and t.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Help requests are busy right now. Email support@trefortpro.com instead';
  end if;

  insert into public.support_tickets
    (requester_name, requester_email, area, subject, message, page_path, user_agent, last_error, ip_hash)
  values
    (left(nullif(btrim(coalesce(p_name, '')), ''), 120), v_email, 'public',
     left(btrim(coalesce(p_subject, '')), 140), left(btrim(coalesce(p_message, '')), 4000),
     left(p_page_path, 500), left(p_user_agent, 500), left(p_last_error, 1000), left(p_ip_hash, 128))
  returning * into v_ticket;

  return jsonb_build_object('id', v_ticket.id, 'reference', v_ticket.reference, 'requester_email', v_ticket.requester_email);
end $$;

-- Server only: records whether the email to support went out.
create or replace function public.set_support_ticket_email_status(p_ticket uuid, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.support_tickets set email_status = p_status
  where id = p_ticket and p_status in ('sent', 'failed', 'not_configured');
$$;

-- ───────── Owner console ─────────

create or replace function public.platform_list_support_tickets(p_status text default 'open', p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return coalesce((
    select jsonb_agg(row_to_json(r)::jsonb order by r.created_at desc)
    from (
      select t.id, t.reference, t.status, t.area, t.subject, t.message, t.requester_name, t.requester_email,
             t.requester_role, t.page_path, t.user_agent, t.last_error, t.context, t.email_status,
             t.created_at, t.closed_at,
             t.organization_id, o.display_name as organization_name,
             t.project_id, p.name as project_name, p.project_number,
             t.support_access_grant_id,
             (g.id is not null and g.revoked_at is null and g.expires_at > now()) as support_access_open,
             (select u.email::text from auth.users u where u.id = t.closed_by) as closed_by_email
      from public.support_tickets t
      left join public.organizations o on o.id = t.organization_id
      left join public.projects p on p.id = t.project_id
      left join public.support_access_grants g on g.id = t.support_access_grant_id
      where p_status = 'all' or t.status = p_status
      order by t.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 300)
    ) r
  ), '[]'::jsonb);
end $$;

create or replace function public.platform_set_support_ticket_status(p_ticket uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid; v_ref text;
begin
  perform public.assert_platform_admin();
  if p_status not in ('open', 'closed') then
    raise exception 'Unknown status';
  end if;
  update public.support_tickets
    set status = p_status,
        closed_at = case when p_status = 'closed' then now() end,
        closed_by = case when p_status = 'closed' then auth.uid() end
    where id = p_ticket
    returning organization_id, reference into v_org, v_ref;
  if v_ref is null then
    raise exception 'Help request not found';
  end if;
  insert into public.platform_admin_events (actor_id, action, organization_id, details)
  values (auth.uid(), case when p_status = 'closed' then 'help_request_closed' else 'help_request_reopened' end,
          v_org, jsonb_build_object('reference', v_ref));
end $$;

-- ───────── Access ─────────

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_support_ticket(text, text, text, uuid, uuid, text, text, text, jsonb, integer)',
    'public.platform_list_support_tickets(text, integer)',
    'public.platform_set_support_ticket_status(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.create_public_support_ticket(text, text, text, text, text, text, text, text)',
    'public.set_support_ticket_email_status(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
