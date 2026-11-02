alter table public.projects
  add column if not exists planned_business_days integer
  check (planned_business_days is null or (planned_business_days > 0 and planned_business_days <= 10000));

comment on column public.projects.planned_business_days is
  'Optional Mon-Fri duration used to calculate target_completion_date. Start date (or next Monday) counts as day 1.';
