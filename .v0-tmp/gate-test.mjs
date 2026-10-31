import fs from 'node:fs'
import pg from '/tmp/sqlcheck/node_modules/pg/lib/index.js'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL).replace(/[?&]sslmode=[^&]*/, '')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
const migration = fs.readFileSync('/vercel/share/v0-project/supabase/migrations/20261118000010_project_completion_readiness.sql', 'utf8')
const results = []
const pass = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`)
const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))

async function as(uid) {
  await client.query('reset role')
  if (!uid) return
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
  await client.query('set local role authenticated')
}
async function expectErr(name, sql, params, match) {
  await client.query('savepoint s')
  try {
    await client.query(sql, params)
    pass(name, false, 'no error raised')
  } catch (e) {
    pass(name, match.test(e.message), e.message.slice(0, 140))
  }
  await client.query('rollback to savepoint s')
}

await client.connect()
try {
  await client.query('begin')
  await client.query(migration)
  pass('migration applies', true)

  const shen = (await client.query(`select id, status, completion_date from projects where name ilike '%shenandoah%' limit 1`)).rows[0]
  const shenWarranty = (await client.query(`select start_date from project_warranties where project_id = $1`, [shen.id])).rows[0]

  const target = (await client.query(`
    select p.id, p.name, p.status, p.organization_id from projects p
     where p.status <> 'completed' and p.archived_at is null
       and public.project_status_transition_allowed(p.status, 'completed')
     order by (p.status in ('punch_list','final_inspection')) desc limit 1`)).rows[0]
  if (!target) throw new Error('No project can transition to completed')
  const roles = (await client.query(`select user_id, role from organization_memberships where organization_id = $1 and status = 'active'`, [target.organization_id])).rows
  const admin = roles.find((r) => r.role === 'org_admin')?.user_id
  const pm = roles.find((r) => r.role === 'project_manager')?.user_id
  results.push(`INFO target=${target.name} (${target.status}) admin=${Boolean(admin)} pm=${Boolean(pm)}`)

  await expectErr('direct UPDATE to completed is blocked', `update projects set status = 'completed' where id = $1`, [target.id], /completion readiness review/)

  await as(admin)
  await expectErr('change_project_status RPC to completed is blocked', `select change_project_status($1, 'completed', 'x')`, [target.id], /completion readiness review/)
  const blockers = (await client.query(`select project_completion_blockers($1) b`, [target.id])).rows[0].b
  results.push(`INFO blockers=${JSON.stringify(blockers.map((b) => `${b.key}:${b.overridable}`))}`)

  await expectErr('future completion date rejected', `select complete_project($1, current_date + 1)`, [target.id], /future/)
  if (blockers.length > 0) {
    await expectErr('completion without exceptions blocked when requirements unmet', `select complete_project($1, current_date)`, [target.id], /(not satisfied|cannot be waived)/)
  }
  const overridable = blockers.filter((b) => b.overridable)
  const hard = blockers.filter((b) => !b.overridable)
  const goodExceptions = overridable.map((b) => ({
    key: b.key, reason: 'Homeowner occupancy', justification: 'Homeowner took occupancy; remaining item scheduled with the trade partner.',
    follow_up_user_id: admin, target_resolution_date: null, evidence_reference: 'Email from homeowner',
  }))
  if (hard.length > 0) {
    await expectErr('non-overridable requirement cannot be bypassed', `select complete_project($1, current_date, null, $2)`,
      [target.id, JSON.stringify(goodExceptions)], /cannot be waived/)
    await as(null)
    await client.query(`update schedule_activities set status = 'completed' where project_id = $1 and activity_type = 'inspection' and status not in ('completed','skipped')`, [target.id])
    await as(admin)
  }
  if (overridable.length > 0) {
    await expectErr('missing exception for outstanding requirement rejected', `select complete_project($1, current_date, null, $2)`,
      [target.id, JSON.stringify(goodExceptions.slice(1))], /not satisfied/)
  }
  await expectErr('exception for non-outstanding requirement rejected', `select complete_project($1, current_date, null, $2)`,
    [target.id, JSON.stringify([...goodExceptions, { key: 'bogus_rule', reason: 'xyz', justification: 'x'.repeat(30), follow_up_user_id: admin }])],
    /Readiness changed/)
  if (overridable.length > 0) {
    await expectErr('weak justification rejected', `select complete_project($1, current_date, null, $2)`,
      [target.id, JSON.stringify(goodExceptions.map((e, i) => (i === 0 ? { ...e, justification: 'n/a' } : e)))], /substantive/)
    await expectErr('follow-up owner must be active staff', `select complete_project($1, current_date, null, $2)`,
      [target.id, JSON.stringify(goodExceptions.map((e) => ({ ...e, follow_up_user_id: '00000000-0000-0000-0000-000000000000' })))], /responsible for follow-up/)
    await as(null)
    await client.query(`update organization_memberships set role = 'project_manager' where organization_id = $1 and user_id = $2`, [target.organization_id, pm ?? admin])
    await as(pm ?? admin)
    await expectErr('project manager cannot approve exceptions', `select complete_project($1, current_date, null, $2)`,
      [target.id, JSON.stringify(goodExceptions)], /Only an administrator/)
    await as(null)
    if (!pm) await client.query(`update organization_memberships set role = 'org_admin' where organization_id = $1 and user_id = $2`, [target.organization_id, admin])
    await as(admin)
  }

  const reviewId = (await client.query(`select complete_project($1, current_date - 1, 'Closed out in test', $2) id`, [target.id, JSON.stringify(goodExceptions)])).rows[0].id
  pass('authorized completion succeeds', Boolean(reviewId))
  await as(null)
  const after = (await client.query(`select status, completion_date, current_date - 1 as expected from projects where id = $1`, [target.id])).rows[0]
  pass('status completed with the entered date', after.status === 'completed' && day(after.completion_date) === day(after.expected), day(after.completion_date))
  const hist = (await client.query(`select note from project_status_history where project_id = $1 order by created_at desc limit 1`, [target.id])).rows[0]
  pass('status history recorded with note', hist?.note === 'Closed out in test', hist?.note)
  const review = (await client.query(`select outcome, exception_count, approved_by from project_completion_reviews where id = $1`, [reviewId])).rows[0]
  pass('review row records outcome and approver', review.approved_by === admin && review.exception_count === overridable.length, `${review.outcome}/${review.exception_count}`)
  const w = (await client.query(`select start_date from project_warranties where project_id = $1`, [target.id])).rows[0]
  results.push(`INFO warranty start=${w ? day(w.start_date) : 'none (feature off)'} completion=${day(after.completion_date)}`)
  const openIssues = (await client.query(`select count(*)::int n from project_issues where project_id = $1 and status in ('open','in_progress')`, [target.id])).rows[0].n
  results.push(`INFO open punch items preserved after completion=${openIssues}`)

  await as(admin)
  await expectErr('duplicate completion rejected', `select complete_project($1, current_date)`, [target.id], /already been completed/)
  if (overridable.length > 0) {
    const ex = (await client.query(`select id from project_completion_exceptions where review_id = $1 limit 1`, [reviewId])).rows[0]
    await expectErr('resolution needs a real note', `select resolve_completion_exception($1, 'ok')`, [ex.id], /Describe/)
    await client.query(`select resolve_completion_exception($1, 'Trade returned and finished the work.')`, [ex.id])
    await as(null)
    const r = (await client.query(`select status, resolved_by, approved_by from project_completion_exceptions where id = $1`, [ex.id])).rows[0]
    pass('exception resolved, approval retained', r.status === 'resolved' && r.resolved_by === admin && r.approved_by === admin)
    await as(admin)
    await expectErr('authenticated cannot insert exceptions directly',
      `insert into project_completion_exceptions (organization_id, project_id, review_id, requirement_key, requirement_label, reason, justification, follow_up_user_id, approved_by) values ($1,$2,$3,'x_x','x','abc','${'x'.repeat(25)}',$4,$4)`,
      [target.organization_id, target.id, reviewId, admin], /permission denied|row-level security/)
    const visible = (await client.query(`select count(*)::int n from project_completion_exceptions where project_id = $1`, [target.id])).rows[0].n
    pass('staff can read exceptions via RLS', visible === overridable.length)
  }

  await as(null)
  const shenAfter = (await client.query(`select status, completion_date from projects where id = $1`, [shen.id])).rows[0]
  const shenWAfter = (await client.query(`select start_date from project_warranties where project_id = $1`, [shen.id])).rows[0]
  pass('Shenandoah unchanged', shenAfter.status === 'completed' && day(shenAfter.completion_date) === day(shen.completion_date) && day(shenWAfter?.start_date) === day(shenWarranty?.start_date))
} catch (e) {
  results.push(`ERROR ${e.message}`)
} finally {
  await client.query('rollback').catch(() => {})
  await client.end()
  console.log(results.join('\n'))
}
