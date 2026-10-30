import postgres from 'postgres'
import fs from 'node:fs'

const FILE = '/vercel/share/v0-project/supabase/migrations/20261105000010_business_contacts.sql'
const VERSION = '20261105000010'
const NAME = 'business_contacts'
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: 'require', max: 1, onnotice: () => {} })
const body = fs.readFileSync(FILE, 'utf8')

try {
  const [{ exists }] = await sql`select exists(select 1 from supabase_migrations.schema_migrations where version = ${VERSION}) as exists`
  if (exists) {
    console.log('already applied')
  } else {
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into supabase_migrations.schema_migrations (version, name, statements) values (${VERSION}, ${NAME}, ${[body]})`
    })
    console.log('applied', VERSION)
  }
  const tables = await sql`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'business_%' and c.relkind = 'r' order by 1`
  console.log(JSON.stringify(tables))
  const pol = await sql`select tablename, count(*)::int as n from pg_policies where schemaname='public' and tablename like 'business_%' group by 1 order by 1`
  console.log(JSON.stringify(pol))
} catch (e) {
  console.error('FAILED (rolled back):', e.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
