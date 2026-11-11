-- Staff join a workspace only by accepting a secure, expiring, single-use invitation link that is bound to the
-- invited email. Creating an authentication account no longer grants membership on its own.

alter table public.invitations
  add column if not exists token_hash text,
  add column if not exists project_ids uuid[] not null default '{}',
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null;

create unique index if not exists invitations_token_hash_unique on public.invitations (token_hash) where token_hash is not null;

-- Email-matched auto-acceptance let any account that confirmed an invited address join without the link.
create or replace function public.accept_pending_invitations()
returns integer language sql security definer set search_path = '' as $$ select 0 $$;
revoke execute on function public.accept_pending_invitations() from public, anon, authenticated;

-- Public builder-workspace creation is disabled for the invitation-only deployment.
revoke execute on function public.create_organization(text, text, text, text, text, text, text) from authenticated;

create or replace function public.invitation_preview(p_token text)
returns table (status text, email text, role public.org_role, organization_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select
    case
      when i.status = 'accepted' then 'accepted'
      when i.status = 'revoked' then 'revoked'
      when i.expires_at <= now() then 'expired'
      else 'pending'
    end,
    i.email, i.role, coalesce(nullif(o.display_name, ''), o.legal_name, 'your builder'), i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where p_token is not null and length(p_token) between 32 and 128
    and i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.role <> 'client';
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_inv public.invitations;
  v_existing public.organization_memberships;
begin
  if v_uid is null then return jsonb_build_object('result', 'signed_out'); end if;
  if p_token is null or length(p_token) not between 32 and 128 then return jsonb_build_object('result', 'invalid'); end if;

  select * into v_inv from public.invitations
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and role <> 'client'
    for update;
  if not found then return jsonb_build_object('result', 'invalid'); end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;

  if v_inv.status = 'accepted' then
    if v_inv.accepted_by = v_uid then
      return jsonb_build_object('result', 'accepted', 'organization_id', v_inv.organization_id);
    end if;
    return jsonb_build_object('result', 'used');
  end if;
  if v_inv.status = 'revoked' then return jsonb_build_object('result', 'revoked'); end if;
  if v_inv.expires_at <= now() then return jsonb_build_object('result', 'expired'); end if;
  if v_email is distinct from lower(v_inv.email) then return jsonb_build_object('result', 'wrong_account'); end if;
  if v_confirmed is null then return jsonb_build_object('result', 'unconfirmed'); end if;

  select * into v_existing from public.organization_memberships
    where organization_id = v_inv.organization_id and user_id = v_uid;
  if found and v_existing.status <> 'active' then
    return jsonb_build_object('result', 'suspended');
  end if;

  -- An existing membership keeps its current role: an invitation never raises permissions on acceptance.
  if not found then
    insert into public.organization_memberships (organization_id, user_id, role, status, invited_by)
      values (v_inv.organization_id, v_uid, v_inv.role, 'active', v_inv.invited_by);
  end if;

  insert into public.project_members (organization_id, project_id, user_id, created_by)
    select v_inv.organization_id, p.id, v_uid, v_inv.invited_by
    from public.projects p
    where p.id = any (v_inv.project_ids) and p.organization_id = v_inv.organization_id and p.archived_at is null
  on conflict (project_id, user_id) do nothing;

  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('result', 'accepted', 'organization_id', v_inv.organization_id);
end;
$$;

revoke execute on function public.invitation_preview(text) from public;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
