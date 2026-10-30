import postgres from 'postgres'
import fs from 'node:fs'

const MIGRATION = '/vercel/share/v0-project/supabase/migrations/20261105000010_business_contacts.sql'
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require', max: 1, onnotice: () => {} })
const results = []
const pass = (name, ok, detail = '') => results.push({ ok: !!ok, name, detail: String(detail) })
const ROLLBACK = new Error('ROLLBACK')

async function fails(tx, name, fn, expect) {
  try {
    await tx.savepoint(fn)
    pass(name, false, 'unexpectedly succeeded')
  } catch (e) {
    pass(name, !expect || e.message.toLowerCase().includes(expect.toLowerCase()), e.message)
  }
}

const counts = async (tx) =>
  (
    await tx`select
      (select count(*) from public.client_contacts)::int client_contacts,
      (select count(*) from public.portal_accounts)::int portal_accounts,
      (select count(*) from public.portal_project_access)::int portal_project_access,
      (select count(*) from public.organization_memberships)::int memberships,
      (select count(*) from public.organizations)::int organizations,
      (select md5(string_agg(c::text, ',' order by c.id)) from public.client_contacts c) client_contacts_hash,
      (select md5(string_agg(p::text, ',' order by p.id)) from public.portal_accounts p) portal_hash`
  )[0]

try {
  await sql.begin(async (tx) => {
    const before = await counts(tx)
    await tx.unsafe(fs.readFileSync(MIGRATION, 'utf8'))
    pass('12. Migration applies cleanly on the live schema (rolled-back transaction)', true)

    const [{ id: org }] = await tx`select id from public.organizations order by created_at limit 1`
    const projects = await tx`select id from public.projects where organization_id = ${org} order by created_at limit 2`
    const [sub] = await tx`select id, company_name, trade, status from public.subcontractor_companies where organization_id = ${org} order by created_at limit 1`
    const [{ n: subAssignBefore }] = await tx`select count(*)::int n from public.subcontractor_project_assignments where subcontractor_company_id = ${sub.id}`

    const person = async (first, last, email, o = org) =>
      (await tx`insert into public.business_people (organization_id, first_name, last_name, email) values (${o}, ${first}, ${last}, ${email}) returning id`)[0].id
    const company = async (name, o = org) =>
      (await tx`insert into public.business_companies (organization_id, company_name) values (${o}, ${name}) returning id`)[0].id
    const linkPC = async (p, c, role, primary = false) =>
      (await tx`insert into public.business_person_companies (organization_id, person_id, company_id, position_or_role, is_primary_contact) values (${org}, ${p}, ${c}, ${role}, ${primary}) returning id`)[0].id
    const linkPP = async (p, pr, role, pc = null) =>
      (await tx`insert into public.business_person_projects (organization_id, person_id, project_id, project_role, person_company_id) values (${org}, ${p}, ${pr}, ${role}, ${pc}) returning id`)[0].id

    const p1 = await person('Test', 'Rep', 'zz.test.rep@example.com')
    const p2 = await person('Test', 'Foreman', null)
    const p3 = await person('Test', 'Estimator', null)
    const s1 = await company('ZZ Test Lumber Supply')
    const s2 = await company('ZZ Test Window Supply')

    const [{ id: catSupplier }] = await tx`insert into public.business_categories (organization_id, kind, name) values (${org}, 'business', 'Supplier') returning id`
    const [{ id: catSub }] = await tx`insert into public.business_categories (organization_id, kind, name) values (${org}, 'business', 'Subcontractor') returning id`
    const [{ id: catLumber }] = await tx`insert into public.business_categories (organization_id, kind, name) values (${org}, 'product', 'Lumber') returning id`
    await tx`insert into public.business_company_categories (organization_id, company_id, category_id) values (${org}, ${s1}, ${catSupplier}), (${org}, ${s1}, ${catLumber}), (${org}, ${s2}, ${catSupplier})`

    const r1 = await linkPC(p1, s1, 'Sales Rep', true)
    await linkPC(p1, s2, 'Sales Rep')
    const [{ n: t1 }] = await tx`select count(*)::int n from public.business_person_companies where person_id = ${p1} and status = 'active'`
    pass('1. One person linked to two supplier companies', t1 === 2, `${t1} active links`)
    await fails(tx, 'Second active primary contact for a company rejected', (sp) => sp`insert into public.business_person_companies (organization_id, person_id, company_id, is_primary_contact) values (${org}, ${p3}, ${s1}, true)`, 'primary_key')

    const [{ id: cSub }] = await tx`select public.link_subcontractor_company(${sub.id}) id`
    const [{ id: cSubAgain }] = await tx`select public.link_subcontractor_company(${sub.id}) id`
    pass('Subcontractor linking is idempotent', cSub === cSubAgain)
    await tx`insert into public.business_company_categories (organization_id, company_id, category_id) values (${org}, ${cSub}, ${catSub}), (${org}, ${cSub}, ${catSupplier})`
    pass('A company can be both supplier and subcontractor', true)
    const r2 = await linkPC(p2, cSub, 'Foreman')
    await linkPC(p3, cSub, 'Estimator')
    const [{ n: t2 }] = await tx`select count(*)::int n from public.business_person_companies where company_id = ${cSub} and status = 'active'`
    pass('2. Two contacts linked to one subcontractor', t2 === 2, `${t2} active links`)
    const [subAfter] = await tx`select id, company_name, trade, status from public.subcontractor_companies where id = ${sub.id}`
    const [{ n: subAssignAfter }] = await tx`select count(*)::int n from public.subcontractor_project_assignments where subcontractor_company_id = ${sub.id}`
    pass('3. Subcontractor keeps its ID, fields, and project associations',
      JSON.stringify(subAfter) === JSON.stringify(sub) && subAssignAfter === subAssignBefore,
      `${subAssignAfter} project assignments before and after`)
    await fails(tx, 'Subcontractor link cannot be removed', (sp) => sp`update public.business_companies set subcontractor_company_id = null where id = ${cSub}`, 'cannot be removed')

    if (projects.length < 2) throw new Error('Need two projects in the organization for tests 4/5')
    await linkPP(p1, projects[0].id, 'Supplier rep', r1)
    await linkPP(p1, projects[1].id, 'Window coordinator')
    await linkPP(p2, projects[0].id, 'Site foreman', r2)
    await linkPP(p3, projects[0].id, 'Estimator')
    const [{ n: t4 }] = await tx`select count(*)::int n from public.business_person_projects where person_id = ${p1} and status = 'active'`
    pass('4. One person associated with two projects (different roles)', t4 === 2)
    const [{ n: t5 }] = await tx`select count(*)::int n from public.business_person_projects where project_id = ${projects[0].id} and status = 'active'`
    pass('5. One project contains multiple contacts', t5 === 3, `${t5} active contacts`)
    const [{ n: roster }] = await tx`select count(*)::int n from public.business_person_projects pp join public.business_person_companies pc on pc.id = pp.person_company_id where pc.company_id = ${cSub} and pp.project_id = ${projects[1].id}`
    pass('Company association does not auto-assign its employees', roster === 0)
    await fails(tx, 'Duplicate active project association rejected', (sp) => sp`insert into public.business_person_projects (organization_id, person_id, project_id, project_role) values (${org}, ${p1}, ${projects[0].id}, 'Again')`, 'business_person_projects_active_key')
    await fails(tx, "Another person's company relationship rejected", (sp) => sp`insert into public.business_person_projects (organization_id, person_id, project_id, project_role, person_company_id) values (${org}, ${p3}, ${projects[1].id}, 'X', ${r1})`, 'active relationship of this person')

    await tx`update public.business_person_companies set status = 'ended', ended_at = current_date where id = ${r2}`
    await tx`update public.business_person_projects set status = 'ended', ended_at = current_date where person_id = ${p2} and project_id = ${projects[0].id}`
    const [hist] = await tx`select (select status from public.business_person_companies where id = ${r2}) rel, (select count(*)::int from public.business_person_projects where person_id = ${p2}) pp, (select count(*)::int from public.business_person_projects where person_id = ${p2} and ended_at is not null) ended`
    pass('6. Ended relationships remain as history', hist.rel === 'ended' && hist.pp === 1 && hist.ended === 1)
    await fails(tx, 'Ended relationship cannot be reactivated', (sp) => sp`update public.business_person_companies set status = 'active', ended_at = null where id = ${r2}`, 'cannot be reactivated')
    await fails(tx, 'Ended project association cannot be edited', (sp) => sp`update public.business_person_projects set project_role = 'Changed' where person_id = ${p2} and status = 'ended'`, 'historical')
    await linkPP(p2, projects[0].id, 'Site foreman (returned)')
    pass('Re-association after End Association creates a new row', true)
    await fails(tx, 'Hard delete blocked', (sp) => sp`delete from public.business_people where id = ${p3}`, 'cannot be deleted')

    const [{ id: org2 }] = await tx`insert into public.organizations (display_name) values ('ZZ Verification Org (rolled back)') returning id`
    const foreignPerson = await person('Other', 'Tenant', null, org2)
    const foreignCompany = await company('ZZ Other Tenant Co', org2)
    await fails(tx, '7a. Cross-org person-to-company link rejected', (sp) => sp`insert into public.business_person_companies (organization_id, person_id, company_id) values (${org}, ${foreignPerson}, ${s1})`, 'foreign key')
    await fails(tx, '7b. Cross-org person-to-project link rejected', (sp) => sp`insert into public.business_person_projects (organization_id, person_id, project_id, project_role) values (${org2}, ${foreignPerson}, ${projects[0].id}, 'X')`, 'does not belong')
    await fails(tx, '7c. Cross-org subcontractor link rejected', (sp) => sp`update public.business_companies set subcontractor_company_id = ${sub.id} where id = ${foreignCompany}`)
    await fails(tx, '7d. Cross-org category tag rejected', (sp) => sp`insert into public.business_company_categories (organization_id, company_id, category_id) values (${org2}, ${foreignCompany}, ${catSupplier})`, 'foreign key')

    const p4 = await person('Test', 'Inactive', null)
    await tx`update public.business_people set status = 'inactive' where id = ${p4}`
    await fails(tx, '8a. Inactive contact cannot get a new project association', (sp) => sp`insert into public.business_person_projects (organization_id, person_id, project_id, project_role) values (${org}, ${p4}, ${projects[0].id}, 'X')`, 'inactive')
    await fails(tx, '8b. Inactive contact cannot get a new company relationship', (sp) => sp`insert into public.business_person_companies (organization_id, person_id, company_id) values (${org}, ${p4}, ${s1})`, 'inactive')

    await fails(tx, '11a. Duplicate company name rejected', (sp) => sp`insert into public.business_companies (organization_id, company_name) values (${org}, ' zz test lumber supply ')`, 'business_companies_org_name_key')
    await fails(tx, '11b. Duplicate person email rejected', (sp) => sp`insert into public.business_people (organization_id, first_name, last_name, email) values (${org}, 'A', 'B', 'ZZ.Test.Rep@example.com')`, 'business_people_org_email_key')
    pass('11c. Same name without email allowed (no name-based merging)', !!(await person('Test', 'Rep', null)))
    await tx`insert into public.business_companies (organization_id, company_name) values (${org}, 'ZZ Name Clash Sub')`
    const [{ id: clashSub }] = await tx`insert into public.subcontractor_companies (organization_id, company_name, trade) values (${org}, 'ZZ Name Clash Sub', 'Framing') returning id`
    await fails(tx, '11d. Linking never merges into a same-name company', (sp) => sp`select public.link_subcontractor_company(${clashSub})`, 'already exists')

    const stranger = JSON.stringify({ sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated' })
    await tx.savepoint(async (sp) => {
      await sp`select set_config('request.jwt.claims', ${stranger}, true)`
      await sp`set local role authenticated`
      const [{ n }] = await sp`select count(*)::int n from public.business_people`
      pass('RLS: non-member sees no business contacts', n === 0, `${n} rows visible`)
      await sp`reset role`
    })
    await fails(tx, 'RLS: non-member cannot insert', async (sp) => {
      await sp`select set_config('request.jwt.claims', ${stranger}, true)`
      await sp`set local role authenticated`
      await sp`insert into public.business_people (organization_id, first_name, last_name) values (${org}, 'X', 'Y')`
    }, 'row-level security')
    await fails(tx, 'RLS: anon has no table access', async (sp) => {
      await sp`set local role anon`
      await sp`select count(*) from public.business_people`
    }, 'permission denied')

    const members = await tx`select user_id from public.organization_memberships where organization_id = ${org}`
    let manager = null
    for (const m of members) {
      const [{ ok }] = await tx.savepoint(async (sp) => {
        await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: m.user_id, role: 'authenticated' })}, true)`
        return sp`select public.is_org_manager(${org}) ok`
      })
      if (ok) { manager = m.user_id; break }
    }
    if (manager) {
      await tx.savepoint(async (sp) => {
        await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: manager, role: 'authenticated' })}, true)`
        await sp`set local role authenticated`
        const [row] = await sp`insert into public.business_people (organization_id, first_name, last_name) values (${org}, 'Manager', 'Created') returning created_by`
        const [{ n }] = await sp`select count(*)::int n from public.business_people where organization_id = ${org}`
        pass('RLS: manager can create and read; created_by server-set', row.created_by === manager && n > 0, `${n} visible`)
        const [{ n: other }] = await sp`select count(*)::int n from public.business_people where organization_id = ${org2}`
        pass('RLS: manager cannot see another organization', other === 0)
        await sp`reset role`
      })
    } else {
      pass('RLS: manager positive test', false, 'no manager membership found')
    }

    const auditCols = (await tx`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'audit_events'`).map((r) => r.column_name)
    const col = ['entity_type', 'table_name', 'entity'].find((c) => auditCols.includes(c))
    const [{ n: audits }] = col
      ? await tx.unsafe(`select count(*)::int n from public.audit_events where ${col} like 'business_%'`)
      : [{ n: -1 }]
    pass('Audit events written for directory changes', audits > 0, `${audits} events (column ${col})`)

    const after = await counts(tx)
    pass('9. Homeowner logins unaffected (portal accounts, access, memberships identical)',
      after.portal_accounts === before.portal_accounts && after.portal_hash === before.portal_hash &&
      after.portal_project_access === before.portal_project_access && after.memberships === before.memberships)
    pass('10. Existing client-contact records intact (row hash identical)',
      after.client_contacts === before.client_contacts && after.client_contacts_hash === before.client_contacts_hash)
    pass('11e. No organization added except the explicit test org', after.organizations === before.organizations + 1)

    await tx`set local enable_seqscan = off`
    const plan = async (q) => (await tx.unsafe(`explain ${q}`)).map((r) => r['QUERY PLAN']).join(' | ')
    const plans = {
      'people name search': await plan(`select id from public.business_people where organization_id = '${org}' and lower(last_name) like 'rep%' order by lower(last_name)`),
      'project contacts': await plan(`select * from public.business_person_projects where project_id = '${projects[0].id}' and status = 'active'`),
      'company people': await plan(`select * from public.business_person_companies where company_id = '${s1}' and status = 'active'`),
      'company directory': await plan(`select id from public.business_companies where organization_id = '${org}' and status = 'active' order by company_name`),
    }
    for (const [k, v] of Object.entries(plans)) pass(`13. Index used: ${k}`, /Index/.test(v), v)

    throw ROLLBACK
  })
} catch (e) {
  if (e !== ROLLBACK) results.push({ ok: false, name: 'Unexpected error', detail: e.message })
}

const [{ present }] = await sql`select to_regclass('public.business_people') is not null present`
results.push({ ok: !present, name: 'Rollback verified: production schema unchanged', detail: present ? 'TABLE EXISTS' : 'business tables absent' })
await sql.end()

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail.slice(0, 200)}` : ''}`)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
