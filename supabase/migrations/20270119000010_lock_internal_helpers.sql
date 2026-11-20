-- Internal helpers that write on behalf of another function must not be callable by signed-in users.
--
-- These SECURITY DEFINER helpers trust their arguments: they do not check that the caller belongs to the
-- organization they write to. They are only meant to be called from other SECURITY DEFINER functions
-- (sub_submit_work, review_sub_submission, the subcontractor assignment triggers, is_feature_enabled),
-- which run as the function owner and keep working after this revoke. No table policy calls them.
--
-- Before this, any signed-in user (a homeowner, or someone on a free trial) could call them through the API:
--   notify_sub_company     sent a notification (and its email) with any title, text and link to another
--                          company's subcontractor users
--   notify_sub_reviewers   the same, to another company's admins and project managers
--   resolve_notifications  acknowledged anyone's notifications that share a dedupe key
--   feature_flag_raw       read another company's module switches

revoke execute on function public.notify_sub_company(uuid, uuid, uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.notify_sub_reviewers(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.resolve_notifications(text) from public, anon, authenticated;
revoke execute on function public.feature_flag_raw(uuid, text) from public, anon, authenticated;

grant execute on function public.notify_sub_company(uuid, uuid, uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.notify_sub_reviewers(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.resolve_notifications(text) to service_role;
grant execute on function public.feature_flag_raw(uuid, text) to service_role;

notify pgrst, 'reload schema';
