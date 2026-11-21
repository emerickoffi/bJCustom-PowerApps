-- Trefort pricing and plan contents decided Nov 20-21, 2026.
-- Starter $99/mo or $1,068/yr ($89/mo billed annually) with 3 team seats, and now includes change orders, invoices & progress draws,
-- documents and time tracking. Professional (renamed from Pro) $199/mo or $2,148/yr ($179/mo) with 10 team seats.
-- Business $399/mo or $4,188/yr ($349/mo). The plan key 'pro' is unchanged, so Stripe lookup keys and existing
-- companies keep working. Stripe prices are created on next checkout (lib/stripe.ts ensurePrice);
-- current subscribers stay on their old price until they change plans.
update public.subscription_plans
   set monthly_price_cents = 9900, yearly_price_cents = 106800, max_staff = 3,
       features = array(select distinct unnest(features || array['change_orders', 'invoices', 'documents', 'time_tracking']::text[]))
 where key = 'starter';
update public.subscription_plans set monthly_price_cents = 19900, yearly_price_cents = 214800, name = 'Professional', max_staff = 10 where key = 'pro';
update public.subscription_plans set monthly_price_cents = 39900, yearly_price_cents = 418800 where key = 'business';
