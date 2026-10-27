-- Root cause: clients_select called can_view_client(id), a SECURITY DEFINER helper that
-- re-queries public.clients by id. During INSERT ... RETURNING the new row is not yet
-- visible to that separate lookup, so the RETURNING visibility check failed with 42501
-- even though the INSERT policy passed. Evaluating the same rules against the row's own
-- columns fixes it without changing who can see which clients.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (portal_user_id = auth.uid() and public.is_org_member(organization_id))
    or (
      public.is_org_staff(organization_id)
      and exists (
        select 1 from public.project_clients pc
        where pc.client_id = clients.id and public.can_view_project_internal(pc.project_id)
      )
    )
  );
