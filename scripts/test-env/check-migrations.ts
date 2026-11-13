/**
 * Offline migration dry run: verifies ordering and flags destructive or environment-coupled SQL.
 * Never connects to a database. With --target it also runs the isolation guard against the env.
 *
 *   node scripts/test-env/check-migrations.ts
 *   node --env-file=<test env file> scripts/test-env/check-migrations.ts --target
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkTestIsolation } from '../../lib/test-env/guard.ts'

const DIR = join(process.cwd(), 'supabase/migrations')

const RULES: { label: string; pattern: RegExp }[] = [
  { label: 'DROP TABLE', pattern: /\bdrop\s+table\b/i },
  { label: 'DROP COLUMN', pattern: /\bdrop\s+column\b/i },
  { label: 'DROP SCHEMA', pattern: /\bdrop\s+schema\b/i },
  { label: 'TRUNCATE', pattern: /\btruncate\b/i },
  { label: 'DELETE without WHERE', pattern: /\bdelete\s+from\s+[\w."]+\s*;/i },
  { label: 'UPDATE without WHERE', pattern: /\bupdate\s+[\w."]+\s+set\b[^;]*;/i },
  { label: 'ALTER TYPE', pattern: /\balter\s+column\s+[\w"]+\s+(set\s+data\s+)?type\b/i },
  { label: 'auth schema write', pattern: /\b(insert\s+into|update|delete\s+from|alter\s+table)\s+auth\./i },
  { label: 'storage bucket change', pattern: /\bstorage\.buckets\b/i },
  { label: 'pg_cron schedule', pattern: /\bcron\.schedule\b/i },
  { label: 'outbound HTTP (pg_net)', pattern: /\bnet\.http_(post|get)\b/i },
  { label: 'hard-coded project ref', pattern: /\b[a-z0-9]{20}\.supabase\.co\b/i },
  { label: 'extension', pattern: /\bcreate\s+extension\b/i },
]

const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/

function stripComments(sql: string) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function updateHasWhere(statement: string) {
  return /\bwhere\b/i.test(statement)
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
const problems: string[] = []
const findings: { file: string; label: string; line: number }[] = []
const seen = new Set<string>()

for (const file of files) {
  const match = NAME.exec(file)
  if (!match) problems.push(`${file}: name does not follow <14-digit timestamp>_<name>.sql`)
  else if (seen.has(match[1])) problems.push(`${file}: duplicate timestamp ${match[1]}`)
  else seen.add(match[1])

  const raw = readFileSync(join(DIR, file), 'utf8')
  const sql = stripComments(raw)
  for (const { label, pattern } of RULES) {
    const global = new RegExp(pattern.source, 'gi')
    for (const hit of sql.matchAll(global)) {
      if (label === 'UPDATE without WHERE' && updateHasWhere(hit[0])) continue
      const line = sql.slice(0, hit.index).split('\n').length
      findings.push({ file, label, line })
    }
  }
}

console.log(`Migrations: ${files.length} (${files[0]} → ${files[files.length - 1]})`)
console.log(`Ordering problems: ${problems.length}`)
for (const p of problems) console.log(`  - ${p}`)

const byLabel = new Map<string, typeof findings>()
for (const f of findings) byLabel.set(f.label, [...(byLabel.get(f.label) ?? []), f])
console.log(`Flagged statements: ${findings.length}`)
for (const [label, hits] of byLabel) {
  console.log(`  ${label}: ${hits.length}`)
  for (const h of hits) console.log(`    ${h.file}:${h.line}`)
}

if (process.argv.includes('--target')) {
  const isolation = checkTestIsolation()
  console.log(`Target isolation: ${isolation.ok ? `OK (${isolation.projectId})` : 'FAILED'}`)
  for (const p of isolation.problems) console.log(`  - ${p}`)
  if (!isolation.ok) process.exitCode = 2
}
if (problems.length) process.exitCode = 1
