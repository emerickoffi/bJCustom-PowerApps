import { createClient } from '@supabase/supabase-js'
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
for (const t of ['subcontractor_companies','subcontractor_qualification_requirements','subcontractor_qualification_items','subcontractor_qualification_evidence','subcontractor_qualification_decisions','subcontractor_qualification_events','subcontractor_qualification_summary','subcontractor_qualification_policies']) {
  const r = await s.from(t).select('*', { count: 'exact', head: true })
  console.log(t, r.error ? 'ERR ' + r.error.message : r.count)
}
const r = await s.from('subcontractor_qualification_summary').select('*').limit(3)
console.log(JSON.stringify(r.data ?? r.error, null, 1))
