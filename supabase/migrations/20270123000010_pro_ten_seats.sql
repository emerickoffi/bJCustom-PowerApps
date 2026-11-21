-- Pro includes 10 team seats (was 20). Homeowners stay free and don't use seats.
-- Companies already above 10 keep everyone; they just can't invite more until they're under the limit or upgrade.
update public.subscription_plans set max_staff = 10, updated_at = now() where key = 'pro';
