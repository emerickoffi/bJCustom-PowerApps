-- FOR REVIEW — not yet applied.
--
-- Root cause: 20261027000001 backfilled a primary client_contacts row once, for
-- clients that existed then. Nothing created one for later clients, so clients
-- created after 2026-10-27 have no contacts and portal access falls back to the
-- client record.
--
-- 1. Trigger: every new client gets its primary contact in the same transaction.
-- 2. reconcile_missing_primary_contacts(org, apply): dry-run by default; repairs
--    existing clients without duplicating contacts or changing portal access.

create or replace function public.create_primary_contact_for_client()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.client_contacts
             where client_id = new.id and is_primary and archived_at is null) then
    return new;
  end if;
  -- Portal flags mirror the 20261027000001 backfill; see lib/primary-contact.ts.
  insert into public.client_contacts (organization_id, client_id, first_name, middle_name, last_name, relationship,
      email, phone, alternate_phone, preferred_communication, is_primary, created_by,
      portal_enabled, portal_view_reports, portal_validate_issues, portal_acknowledge, portal_sign)
  values (new.organization_id, new.id, new.first_name, new.middle_name, new.last_name, 'primary_owner',
      new.email, new.phone, new.alternate_phone, new.preferred_communication, true, new.created_by,
      true, true, true, true, true);
  return new;
end;
$$;

drop trigger if exists create_primary_contact_for_client on public.clients;
create trigger create_primary_contact_for_client after insert on public.clients
  for each row execute function public.create_primary_contact_for_client();

create or replace function public.reconcile_missing_primary_contacts(p_organization uuid, p_apply boolean default false)
returns table (client_id uuid, client_name text, action text, linked_portal_accounts int)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_contact uuid;
  v_unlinked int;
  v_linked int;
begin
  if auth.uid() is not null and not public.is_org_manager(p_organization) then
    raise exception 'Not allowed';
  end if;

  for r in
    select c.* from public.clients c
    where c.organization_id = p_organization
      and not exists (select 1 from public.client_contacts cc
                      where cc.client_id = c.id and cc.is_primary and cc.archived_at is null)
    order by c.created_at
  loop
    client_id := r.id;
    client_name := btrim(r.first_name || ' ' || r.last_name);
    linked_portal_accounts := 0;

    -- An active contact who is the same person would be duplicated; leave for staff to promote.
    if exists (select 1 from public.client_contacts cc
               where cc.client_id = r.id and cc.archived_at is null
                 and ((r.email is not null and lower(cc.email) = lower(r.email))
                   or (lower(btrim(cc.first_name)) = lower(btrim(r.first_name))
                       and lower(btrim(cc.last_name)) = lower(btrim(r.last_name))))) then
      action := 'skipped: matching contact exists, promote it to primary';
      return next;
      continue;
    end if;

    select count(*) into v_unlinked from public.portal_accounts pa
      where pa.client_id = r.id and pa.contact_id is null;

    if not p_apply then
      action := 'would create primary contact'
        || case when v_unlinked = 1 then ' and link its portal account'
                when v_unlinked > 1 then ' (multiple unlinked portal accounts left unchanged)'
                else '' end;
      linked_portal_accounts := case when v_unlinked = 1 then 1 else 0 end;
      return next;
      continue;
    end if;

    insert into public.client_contacts (organization_id, client_id, first_name, middle_name, last_name, relationship,
        email, phone, alternate_phone, preferred_communication, is_primary, created_by,
        portal_enabled, portal_view_reports, portal_validate_issues, portal_acknowledge, portal_sign)
    values (r.organization_id, r.id, r.first_name, r.middle_name, r.last_name, 'primary_owner',
        r.email, r.phone, r.alternate_phone, r.preferred_communication, true, r.created_by,
        true, true, true, true, true)
    returning id into v_contact;

    -- An unlinked account has full legacy access; a fully-enabled contact keeps
    -- exactly that. With several unlinked accounts we cannot tell which person
    -- each is, so they stay as they are.
    if v_unlinked = 1 then
      update public.portal_accounts pa set contact_id = v_contact
        where pa.client_id = r.id and pa.contact_id is null;
      get diagnostics v_linked = row_count;
      linked_portal_accounts := v_linked;
    end if;

    action := 'created primary contact';
    return next;
  end loop;
end;
$$;

revoke all on function public.reconcile_missing_primary_contacts(uuid, boolean) from public, anon;
grant execute on function public.reconcile_missing_primary_contacts(uuid, boolean) to authenticated;
