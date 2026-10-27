create or replace function public.sync_client_from_primary_contact()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if not new.is_primary or new.archived_at is not null then return new; end if;
  update public.clients c set
    first_name = new.first_name,
    middle_name = new.middle_name,
    last_name = new.last_name,
    email = new.email,
    phone = new.phone,
    alternate_phone = new.alternate_phone,
    preferred_communication = new.preferred_communication
  where c.id = new.client_id
    and (c.first_name, c.middle_name, c.last_name, c.email, c.phone, c.alternate_phone, c.preferred_communication)
        is distinct from
        (new.first_name, new.middle_name, new.last_name, new.email, new.phone, new.alternate_phone, new.preferred_communication);
  return new;
end;
$$;
drop trigger if exists sync_client_from_primary_contact on public.client_contacts;
create trigger sync_client_from_primary_contact after insert or update on public.client_contacts
  for each row execute function public.sync_client_from_primary_contact();

create or replace function public.sync_primary_contact_from_client()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update public.client_contacts cc set
    first_name = new.first_name,
    middle_name = new.middle_name,
    last_name = new.last_name,
    email = new.email,
    phone = new.phone,
    alternate_phone = new.alternate_phone,
    preferred_communication = new.preferred_communication
  where cc.client_id = new.id and cc.is_primary and cc.archived_at is null
    and (cc.first_name, cc.middle_name, cc.last_name, cc.email, cc.phone, cc.alternate_phone, cc.preferred_communication)
        is distinct from
        (new.first_name, new.middle_name, new.last_name, new.email, new.phone, new.alternate_phone, new.preferred_communication);
  return new;
end;
$$;
drop trigger if exists sync_primary_contact_from_client on public.clients;
create trigger sync_primary_contact_from_client after update of
    first_name, middle_name, last_name, email, phone, alternate_phone, preferred_communication on public.clients
  for each row execute function public.sync_primary_contact_from_client();

update public.clients c set
  first_name = cc.first_name, middle_name = cc.middle_name, last_name = cc.last_name,
  email = cc.email, phone = cc.phone, alternate_phone = cc.alternate_phone,
  preferred_communication = cc.preferred_communication
from public.client_contacts cc
where cc.client_id = c.id and cc.is_primary and cc.archived_at is null
  and (c.first_name, c.middle_name, c.last_name, c.email, c.phone, c.alternate_phone, c.preferred_communication)
      is distinct from
      (cc.first_name, cc.middle_name, cc.last_name, cc.email, cc.phone, cc.alternate_phone, cc.preferred_communication);
