-- New companies now trial the Business plan (every module, including the AI assistant) for 14 days.
-- When the trial ends they choose any plan in Billing. Existing companies are not changed.
create or replace function public.create_organization(p_display_name text, p_legal_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_project_prefix text DEFAULT 'P'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.organization_memberships where user_id = v_uid and status = 'active') then
    raise exception 'You already belong to an organization';
  end if;
  insert into public.organizations (display_name, legal_name, phone, email, city, state, created_by,
                                    plan_key, subscription_status, trial_ends_at)
    values (trim(p_display_name), nullif(trim(p_legal_name), ''), nullif(trim(p_phone), ''),
            nullif(trim(p_email), ''), nullif(trim(p_city), ''), nullif(trim(p_state), ''), v_uid,
            'business', 'trialing', now() + interval '14 days')
    returning id into v_org;
  insert into public.organization_settings (organization_id, project_number_prefix)
    values (v_org, upper(coalesce(nullif(trim(p_project_prefix), ''), 'P')));
  insert into public.organization_memberships (organization_id, user_id, role)
    values (v_org, v_uid, 'org_admin');
  return v_org;
end;
$function$;

revoke all on function public.create_organization(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text) to authenticated, service_role;
