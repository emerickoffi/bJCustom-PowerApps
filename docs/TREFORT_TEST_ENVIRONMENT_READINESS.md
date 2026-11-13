# Trefort test environment readiness report

**Status: NOT READY. Milestone 2 end-to-end testing has not started.**

No writes, migrations, seeds, or resets were run against any database. Production project
`koaaoatcxzhahoeiahxr` was not modified.

## 1. Configuration inventory

| Dependency | Variables | Current state |
| --- | --- | --- |
| Supabase API / Auth | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Set. **Points at production.** |
| Supabase privileged | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET` | Set. **Production secrets.** The app uses only `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/admin.ts`). The test env does not need `SUPABASE_JWT_SECRET` or `SUPABASE_SECRET_KEY`. |
| PostgreSQL | `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` | Set. **Points at production.** The app never reads them at runtime. Only migration tooling needs `POSTGRES_URL_NON_POOLING`. |
| Auth redirects | `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Set. Test redirect URLs belong in the test project's Auth settings. |
| Storage | 7 private buckets created by migrations | Not provisioned in any test project yet. |
| Email (Resend) | `EMAIL_DELIVERY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `APP_BASE_URL`, `EMAIL_ALLOWED_RECIPIENTS` | Not set. Delivery is off. |
| Dropbox Sign | `DROPBOX_SIGN_API_KEY`, `DROPBOX_SIGN_CLIENT_ID`, `DROPBOX_SIGN_TEST_MODE` | API key set. Test mode is on by default. |
| Cron | `CRON_SECRET`, plus `vercel.json` `/api/cron/email-dispatch` every 5 minutes | `CRON_SECRET` not set. pg_cron jobs run inside each database. |
| Payments | `STRIPE_SECRET_KEY` | Not used. The app has no payment processing code. |
| Test isolation | `TREFORT_ENV`, `TREFORT_TEST_SUPABASE_PROJECT_ID` | **Missing.** |

### Missing for the isolated environment

Nothing from production may be reused. Every value must come from the new `trefort-test` project:

- `TREFORT_ENV=test`
- `TREFORT_TEST_SUPABASE_PROJECT_ID=<trefort-test ref>`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `POSTGRES_URL_NON_POOLING`, only on the machine that applies migrations, never in the deployment
- Sandbox email: `EMAIL_ALLOWED_RECIPIENTS=@<test domain>` and a test Resend key. Leave `EMAIL_DELIVERY` unset until the inboxes exist.
- `CRON_SECRET`, a new value for the test deployment
- A Dropbox Sign test key is recommended. With the guard below, the shared key is also forced into `test_mode=1`.

## 2. Why setup stopped

The only Supabase project connected to this chat and Vercel project is production. There is no
`trefort-test` project and no test deployment. Connecting the test project through this chat's
integration would rewrite the env vars of the production Vercel project, which the brief forbids.
The test project needs a **separate Vercel project** (or a Preview-only env scope). Its variables
must be entered there, not here.

## 3. Migration safety (offline dry run)

Command: `node scripts/test-env/check-migrations.ts`. It reads SQL files only and never connects.

- 86 migrations, `20261024000001` → `20261230000010`.
- **Blocker: duplicate versions.** `20261120000010` (assistant_estimate_drafts, builder_led_walkthroughs) and
  `20261210000010` (directory_project_eligibility, staff_tasks). `supabase db push` keys
  `schema_migrations` by version, so a fresh project rejects or skips one file of each pair. Renaming
  them would desync the production migration history, so it needs a deliberate decision. Applying the
  files manually in filename order through `psql` against the verified test URL avoids the conflict.
- TRUNCATE (4): false positives. All four are `revoke ... truncate` privilege statements.
- Storage buckets (8 statements, 7 buckets): all created with `public = false`.
- pg_cron (4 jobs: warranty, email notifications, quote outbox sweep, selection reminders): each job runs
  inside its own database, so it cannot affect production. Its email output still goes through the
  outbox, which the app's sandboxed email config gates.
- `create extension`: one, for pg_cron. No `pg_net` HTTP calls, no hard-coded project refs, no
  `auth.*` writes, no DROP TABLE/COLUMN.

## 4. Guardrails added

`lib/test-env/guard.ts` and the `checkTestIsolation` / `assertTestIsolation` functions fail closed. They require:

1. `TREFORT_ENV=test`.
2. `TREFORT_TEST_SUPABASE_PROJECT_ID` to be a valid ref that is not `koaaoatcxzhahoeiahxr`.
3. Every Supabase URL and Postgres URL/host/pooler user to resolve to that exact ref. An unresolvable
   or custom host fails, and so does any value containing the production ref.
4. `DROPBOX_SIGN_TEST_MODE` not to be `false`, an email allowlist whenever delivery is live, and Stripe keys,
   if any, to be test keys.

Wired into:

- `lib/esign/dropbox-sign.ts`: `test_mode=1` is forced when `TREFORT_ENV=test`, and every signature request
  asserts isolation first.
- `lib/email/config.ts`: under `TREFORT_ENV=test`, delivery is "not ready" without an allowlist or when
  isolation fails. The existing allowlist check enforces recipients per message.
- `app/api/cron/email-dispatch/route.ts`: returns 503 in test mode when isolation fails.
- `node --env-file=<test env> scripts/test-env/check-migrations.ts --target` runs the pre-migration
  target check (exit 2 on failure).

## 5. Validation results

| Check | Result |
| --- | --- |
| Guard unit tests (9) | Pass |
| Full unit suite (537) | Pass |
| TypeScript | Clean |
| Guard against current env | **FAILED (correct).** All 7 connection values point at production. |
| User creation / sign-in, roles, tenant isolation, projects, Storage, migrations apply, email sandbox, Dropbox Sign test mode, DB read/write | **Not run.** No isolated project exists. |

## 6. To unblock

1. Create the Supabase project `trefort-test` and a separate Vercel project for the test deployment.
2. Put the section 1 variables (from `trefort-test` only) on that Vercel project.
3. Decide how to handle the two duplicate migration versions.
4. Run the `--target` check. Apply migrations only when it reports `OK (<test ref>)`.
5. Re-run section 5 with fictional records, then start Milestone 2.
