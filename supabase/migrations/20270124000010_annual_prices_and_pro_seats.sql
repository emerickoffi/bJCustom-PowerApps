-- Annual billing (Nov 21, 2026): $89 / $179 / $349 a month, billed once a year as $1,068 / $2,148 / $4,188.
-- These yearly amounts were already set in production by hand; this records them so a fresh database matches.
-- Professional now includes 15 office team members (was 10). Business stays unlimited.
-- Stripe picks up the new yearly amounts on the next checkout (lib/stripe.ts ensurePrice); existing subscribers
-- keep their current price until they change plans.

update public.subscription_plans set yearly_price_cents = 106800 where key = 'starter';
update public.subscription_plans set yearly_price_cents = 214800, max_staff = 15 where key = 'pro';
update public.subscription_plans set yearly_price_cents = 418800 where key = 'business';
