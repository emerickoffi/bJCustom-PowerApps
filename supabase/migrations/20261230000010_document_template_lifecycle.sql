-- Document template lifecycle: draft -> published -> archived.
-- Only published, unarchived templates are offered when preparing a client document.
-- Proposals copy template content when applied, so editing or unpublishing a template
-- never changes a proposal that already exists or was sent.

alter table public.proposal_templates add column if not exists published_at timestamptz;

-- Existing templates were already usable, so keep them available.
update public.proposal_templates set published_at = coalesce(published_at, created_at) where published_at is null;

create or replace function public.proposal_templates_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'Template cannot move to another organization';
  end if;
  -- A draft or archived template can't be the default the team starts from.
  if new.archived_at is not null or new.published_at is null then new.is_default := false; end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
