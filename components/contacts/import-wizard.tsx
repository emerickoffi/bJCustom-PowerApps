'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Download, FileUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NativeSelect } from '@/components/shared/form-field'
import { DIRECTORY_TH_TEXT, DIRECTORY_THEAD_ROW } from '@/lib/directory-table-styles'
import {
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  applyMapping,
  guessMapping,
  importTemplateCsv,
  parseCsv,
  toCsv,
  validateImportRows,
  type ImportMapping,
  type ImportRow,
} from '@/lib/contacts'
import { checkImportEmailsAction, importContactsAction, type ImportRowResult } from '@/app/actions/contacts'

type Step = 'upload' | 'map' | 'review' | 'done'
const MAX_BYTES = 2 * 1024 * 1024

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'map', label: 'Map columns' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Results' },
]

export function ImportWizard() {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [body, setBody] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [rows, setRows] = useState<ImportRow[]>([])
  const [results, setResults] = useState<ImportRowResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === undefined)
  const counts = useMemo(
    () => ({
      ready: rows.filter((r) => !r.errors.length && !r.duplicate).length,
      invalid: rows.filter((r) => r.errors.length).length,
      duplicate: rows.filter((r) => !r.errors.length && r.duplicate).length,
    }),
    [rows],
  )

  async function onFile(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') return setError('Choose a .csv file.')
    if (file.size > MAX_BYTES) return setError('The file is larger than 2 MB. Split it into smaller files.')
    const parsed = parseCsv(await file.text())
    if (parsed.length < 2) return setError('The file needs a header row and at least one contact.')
    if (parsed.length - 1 > IMPORT_MAX_ROWS) return setError(`Import up to ${IMPORT_MAX_ROWS} contacts at a time. This file has ${parsed.length - 1}.`)
    setFileName(file.name)
    setHeaders(parsed[0].map((h, i) => h.trim() || `Column ${i + 1}`))
    setBody(parsed.slice(1))
    setMapping(guessMapping(parsed[0]))
    setStep('map')
  }

  function review() {
    startTransition(async () => {
      const mapped = applyMapping(body, mapping)
      const check = await checkImportEmailsAction(mapped.map((r) => r.values.email))
      if (!check.ok) return setError(check.error)
      setError(null)
      setRows(validateImportRows(mapped, new Set(check.existingEmails)))
      setStep('review')
    })
  }

  function runImport() {
    startTransition(async () => {
      const ready = rows.filter((r) => !r.errors.length && !r.duplicate)
      const res = await importContactsAction(ready.map((r) => ({ line: r.line, values: r.values })))
      if (!res.ok) return setError(res.error)
      const skippedUpfront: ImportRowResult[] = rows
        .filter((r) => r.errors.length || r.duplicate)
        .map((r) => ({
          line: r.line,
          status: r.errors.length ? 'failed' : 'skipped',
          message: r.errors.length ? r.errors.join('; ') : r.duplicate === 'existing' ? 'Email already exists' : 'Duplicate email in file',
        }))
      const all = [...res.results, ...skippedUpfront].sort((a, b) => a.line - b.line)
      setResults(all)
      setError(null)
      setStep('done')
      const created = all.filter((r) => r.status === 'created').length
      toast.success(`Imported ${created} ${created === 1 ? 'contact' : 'contacts'}.`)
    })
  }

  function downloadErrors() {
    const byLine = new Map(rows.map((r) => [r.line, r]))
    const problems = results.filter((r) => r.status !== 'created' || r.message)
    download(
      'contacts-import-errors.csv',
      toCsv(
        ['Line', 'Result', 'Message', ...IMPORT_FIELDS.map((f) => f.label)],
        problems.map((p) => [p.line, p.status, p.message ?? '', ...IMPORT_FIELDS.map((f) => byLine.get(p.line)?.values[f.key] ?? '')]),
      ),
    )
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Import progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2" aria-current={i === stepIndex ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                i < stepIndex ? 'bg-primary/15 text-primary' : i === stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            <span className={i === stepIndex ? 'font-medium text-foreground' : 'text-muted-foreground'}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {step === 'upload' && (
        <section className="flex flex-col gap-5 rounded-xl border border-border/80 bg-card p-6 shadow-xs">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-input bg-muted/30 px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-sage/50 focus-within:ring-2 focus-within:ring-ring">
            <FileUp className="size-8 text-primary" aria-hidden="true" />
            <span className="font-semibold text-foreground">Choose a CSV file</span>
            <span className="text-sm text-muted-foreground">Up to {IMPORT_MAX_ROWS} contacts, 2 MB max. The first row must contain column names.</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>Rows with an email that already exists are skipped, never merged. Companies are matched by exact name or created.</p>
            <Button variant="outline" onClick={() => download('contacts-import-template.csv', importTemplateCsv())}>
              <Download data-icon="inline-start" />
              Download template
            </Button>
          </div>
        </section>
      )}

      {step === 'map' && (
        <section className="flex flex-col gap-5 rounded-xl border border-border/80 bg-card p-6 shadow-xs">
          <div>
            <h2 className="font-semibold text-foreground">Map columns from {fileName}</h2>
            <p className="text-sm text-muted-foreground">{body.length} rows found. Match each field to a column in your file.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label htmlFor={`map-${f.key}`} className="text-sm font-medium text-foreground">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </label>
                <NativeSelect
                  id={`map-${f.key}`}
                  value={mapping[f.key] ?? ''}
                  aria-invalid={f.required && mapping[f.key] === undefined ? true : undefined}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m }
                      if (e.target.value === '') delete next[f.key]
                      else next[f.key] = Number(e.target.value)
                      return next
                    })
                  }
                >
                  <option value="">Do not import</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep('upload')}>
              Choose another file
            </Button>
            <div className="flex items-center gap-3">
              {missingRequired.length > 0 && <p className="text-sm text-destructive">Map {missingRequired.map((f) => f.label).join(' and ')} to continue.</p>}
              <Button disabled={missingRequired.length > 0 || pending} onClick={review}>
                {pending ? 'Checking…' : 'Review rows'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === 'review' && (
        <section className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-6 shadow-xs">
          <div className="flex flex-wrap gap-3">
            <Stat tone="success" label="Ready to import" value={counts.ready} />
            <Stat tone="pending" label="Duplicates (skipped)" value={counts.duplicate} />
            <Stat tone="danger" label="Invalid (skipped)" value={counts.invalid} />
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className={DIRECTORY_THEAD_ROW}>
                  <TableHead className={cn(DIRECTORY_TH_TEXT, 'w-16')}>Line</TableHead>
                  <TableHead className={DIRECTORY_TH_TEXT}>Name</TableHead>
                  <TableHead className={DIRECTORY_TH_TEXT}>Email</TableHead>
                  <TableHead className={DIRECTORY_TH_TEXT}>Company</TableHead>
                  <TableHead className={DIRECTORY_TH_TEXT}>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="tabular-nums text-muted-foreground">{r.line}</TableCell>
                    <TableCell className="font-medium">{`${r.values.first_name} ${r.values.last_name}`.trim() || '—'}</TableCell>
                    <TableCell className="text-sm">{r.values.email || '—'}</TableCell>
                    <TableCell className="text-sm">{r.values.company_name || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {r.errors.length ? (
                        <span className="text-destructive">{r.errors.join('; ')}</span>
                      ) : r.duplicate ? (
                        <span className="text-[#96570E]">{r.duplicate === 'existing' ? 'Email already in directory' : 'Duplicate email in file'}</span>
                      ) : (
                        <span className="text-[#187542]">Ready</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" disabled={pending} onClick={() => setStep('map')}>
              Back to mapping
            </Button>
            <Button disabled={!counts.ready || pending} onClick={runImport}>
              {pending ? 'Importing…' : `Import ${counts.ready} ${counts.ready === 1 ? 'contact' : 'contacts'}`}
            </Button>
          </div>
        </section>
      )}

      {step === 'done' && (
        <section className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-6 shadow-xs">
          <div className="flex flex-wrap gap-3">
            <Stat tone="success" label="Created" value={results.filter((r) => r.status === 'created').length} />
            <Stat tone="pending" label="Skipped" value={results.filter((r) => r.status === 'skipped').length} />
            <Stat tone="danger" label="Failed" value={results.filter((r) => r.status === 'failed').length} />
          </div>
          {results.some((r) => r.status !== 'created' || r.message) && (
            <p className="text-sm text-muted-foreground">
              Some rows were not fully imported. Download the error report, fix the rows, and import that file again. Rows already created will be skipped.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {results.some((r) => r.status !== 'created' || r.message) && (
              <Button variant="outline" onClick={downloadErrors}>
                <Download data-icon="inline-start" />
                Download error report
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setStep('upload')
                setRows([])
                setResults([])
              }}
            >
              Import another file
            </Button>
            <Button render={<Link href="/contacts?view=people" />} nativeButton={false}>View contacts</Button>
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ tone, label, value }: { tone: 'success' | 'pending' | 'danger'; label: string; value: number }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'pending' ? AlertTriangle : XCircle
  const color = tone === 'success' ? 'text-[#187542] bg-[#E2F3E9]' : tone === 'pending' ? 'text-[#96570E] bg-[#FFF2DA]' : 'text-[#BD302B] bg-[#FDE8E7]'
  return (
    <div className="flex min-w-40 items-center gap-3 rounded-lg border bg-background px-4 py-3">
      <span className={cn('flex size-8 items-center justify-center rounded-full', color)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xl font-semibold tabular-nums leading-none text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
