-- Trefort pricing decided Nov 20-21, 2026.
-- Starter $99/mo or $990/yr, Professional (renamed from Pro) $199/mo or $1,990/yr with 10 team seats,
-- Business $399/mo or $3,990/yr. The plan key 'pro' is unchanged, so Stripe lookup keys and existing
-- companies keep working. Stripe prices are created on next checkout (lib/stripe.ts ensurePrice);
-- current subscribers stay on their old price until they change plans.
update public.subscription_plans set monthly_price_cents = 9900,  yearly_price_cents = 99000  where key = 'starter';
update public.subscription_plans set monthly_price_cents = 19900, yearly_price_cents = 199000, name = 'Professional', max_staff = 10 where key = 'pro';
update public.subscription_plans set monthly_price_cents = 39900, yearly_price_cents = 399000 where key = 'business';
