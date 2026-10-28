-- Optional project cover image (rendering, 3D visualization, or photo), stored in the private
-- project-media bucket under covers/<organization_id>/<uuid>.<ext>.

alter table public.projects
  add column if not exists cover_image_path text,
  add column if not exists cover_image_kind text,
  add column if not exists cover_image_updated_at timestamptz;

alter table public.projects drop constraint if exists projects_cover_image_kind_check;
alter table public.projects add constraint projects_cover_image_kind_check
  check (cover_image_kind is null or cover_image_kind in ('architectural_rendering','3d_visualization','construction_photo','completed_home_photo'));

alter table public.projects drop constraint if exists projects_cover_image_path_check;
alter table public.projects add constraint projects_cover_image_path_check
  check (cover_image_path is null or cover_image_path like 'covers/' || organization_id::text || '/%');

create or replace function public.can_upload_media_path(p_path text)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w
      join public.walkthrough_items i on i.walkthrough_id = w.id and i.id = public.media_path_uuid(p_path, 3)
      where w.id = public.media_path_uuid(p_path, 2)
        and w.status <> 'submitted'
        and public.is_project_homeowner(w.project_id)
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and pi.status <> 'closed'
        and (public.can_view_project_internal(pi.project_id)
          or (split_part(p_path, '/', 3) = 'feedback'
              and public.is_project_homeowner(pi.project_id)
              and public.portal_contact_can(pi.project_id, 'validate_issues')))
    )
    when 'covers' then coalesce(public.is_org_manager(public.media_path_uuid(p_path, 2)), false)
    else false
  end;
$function$;

create or replace function public.can_view_media_path(p_path text)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w where w.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(w.project_id) or public.is_project_homeowner(w.project_id))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(pi.project_id) or public.is_project_homeowner(pi.project_id))
    )
    when 'covers' then
      coalesce(public.is_org_manager(public.media_path_uuid(p_path, 2)), false)
      or exists (
        select 1 from public.projects p where p.cover_image_path = p_path
          and (public.can_view_project_internal(p.id) or public.is_project_homeowner(p.id))
      )
    else false
  end;
$function$;

drop policy if exists project_media_cover_delete on storage.objects;
create policy project_media_cover_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-media'
    and split_part(name, '/', 1) = 'covers'
    and public.can_upload_media_path(name)
  );
