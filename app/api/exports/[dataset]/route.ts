import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { isMissingTableError } from '@/lib/subcontractors'
import { datasetByKey, datasetCsv, exportFileName, type ExportContext, type Row } from '@/lib/data-exports'

const NO_STORE = { 'Cache-Control': 'no-store' }
const PAGE = 1000
/** Safety cap per file. A company past this gets a clear message instead of a silently cut file. */
const MAX_ROWS = 50000

type Supabase = Awaited<ReturnType<typeof createClient>>

async function fetchAll(supabase: Supabase, table: string, select: string, organizationId: string, orderBy: string) {
  const rows: Row[] = []
  for (let from = 0; from <= MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('organization_id', organizationId)
      .order(orderBy, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { rows: null, error }
    rows.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < PAGE) return { rows, error: null }
  }
  return { rows: null, error: { message: 'too_many' } }
}

async function lookups(supabase: Supabase, organizationId: string, need: { projects: boolean; clients: boolean; people: boolean; invoices: boolean }) {
  const map = (rows: { id: string }[] | null, label: (r: never) => string) => new Map((rows ?? []).map((r) => [r.id, label(r as never)]))
  const [projects, clients, members, invoices] = await Promise.all([
    need.projects ? supabase.from('projects').select('id, name').eq('organization_id', organizationId).limit(50000) : null,
    need.clients ? supabase.from('clients').select('id, first_name, last_name, company_name').eq('organization_id', organizationId).limit(50000) : null,
    need.people ? supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).limit(5000) : null,
    need.invoices ? supabase.from('invoices').select('id, invoice_number').eq('organization_id', organizationId).limit(50000) : null,
  ])
  let people = new Map<string, string>()
  const ids = (members?.data ?? []).map((m) => m.user_id as string)
  if (ids.length) {
    const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
    people = map(data, (p: { full_name: string | null; email: string | null }) => p.full_name || p.email || '')
  }
  const projectNames = map(projects?.data ?? null, (p: { name: string }) => p.name)
  const clientNames = map(clients?.data ?? null, (c: { first_name: string; last_name: string; company_name: string | null }) =>
    [`${c.first_name} ${c.last_name}`.trim(), c.company_name].filter(Boolean).join(' · '),
  )
  const invoiceNumbers = map(invoices?.data ?? null, (i: { invoice_number: string }) => i.invoice_number)
  const get = (m: Map<string, string>) => (id: unknown) => (typeof id === 'string' ? (m.get(id) ?? '') : '')
  const ctx: ExportContext = {
    projectName: get(projectNames),
    clientName: get(clientNames),
    personName: get(people),
    invoiceNumber: get(invoiceNumbers),
  }
  return ctx
}

/**
 * One company dataset as a spreadsheet. Administrators only, and only when Data exports is on. Reads go through RLS with
 * the administrator's own session, so a file never holds anything they can't already see in Trefort.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: NO_STORE })
  if (!session.organizationId || session.activationRequired || session.role !== 'org_admin') {
    return NextResponse.json({ error: 'Only administrators can export company data.' }, { status: 403, headers: NO_STORE })
  }
  const { dataset: key } = await params
  const dataset = datasetByKey(key)
  if (!dataset) return NextResponse.json({ error: 'Unknown export.' }, { status: 404, headers: NO_STORE })
  const features = await getOrgFeatures(session.organizationId)
  if (!features.data_exports || (dataset.feature && !features[dataset.feature])) {
    return NextResponse.json({ error: 'This export is turned off.' }, { status: 404, headers: NO_STORE })
  }

  const supabase = await createClient()
  const { rows, error } = await fetchAll(supabase, dataset.table, dataset.select, session.organizationId, dataset.orderBy)
  if (error || !rows) {
    if (error && isMissingTableError(error as never)) {
      return NextResponse.json({ error: 'This export is not set up in this database yet.' }, { status: 404, headers: NO_STORE })
    }
    const tooMany = error?.message === 'too_many'
    console.error('[exports] failed', dataset.key, error)
    return NextResponse.json(
      { error: tooMany ? `More than ${MAX_ROWS.toLocaleString()} rows. Contact support for a full export.` : 'The export could not be created. Try again.' },
      { status: tooMany ? 413 : 500, headers: NO_STORE },
    )
  }

  const usesColumn = (c: string) => dataset.select.includes(c)
  const ctx = await lookups(supabase, session.organizationId, {
    projects: usesColumn('project_id'),
    clients: usesColumn('client_id'),
    people: usesColumn('user_id') || usesColumn('project_manager_id'),
    invoices: usesColumn('invoice_id'),
  })
  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(datasetCsv(dataset, rows, ctx), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(dataset.key, today)}"`,
    },
  })
}
