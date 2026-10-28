'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession, canManage } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { DOCUMENTS_BUCKET } from '@/lib/documents'
import {
  getProviderConfig,
  createSignatureRequest as providerCreate,
  getSignatureRequest as providerGet,
  cancelSignatureRequest as providerCancel,
  getEmbeddedSignUrl,
  ProviderError,
} from '@/lib/esign/dropbox-sign'
import { buildSigningPacket, MAX_SIGNING_PDF_BYTES } from '@/lib/esign/packet'
import { applyProviderState, recordEvent } from '@/lib/esign/sync'
import { listSignerCandidates } from '@/lib/esign/signers'
import {
  OPEN_STATUSES,
  type EligibleSigner,
  type SignatureRequestView,
  type SignatureSetupState,
  type SignatureStatus,
  type SignerStatus,
  type SigningMethod,
} from '@/lib/signatures'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const uuid = z.string().uuid()
const REQUEST_COLUMNS =
  'id, organization_id, project_id, document_id, source_version_id, provider_request_id, signing_method, ordered, status, title, test_mode, requested_by, error_message, signed_storage_path, signed_size_bytes, artifact_error, completed_at, created_at'

type RequestRow = {
  id: string
  organization_id: string
  project_id: string
  document_id: string
  source_version_id: string
  provider_request_id: string | null
  signing_method: SigningMethod
  ordered: boolean
  status: SignatureStatus
  title: string
  test_mode: boolean
  requested_by: string
  error_message: string | null
  signed_storage_path: string | null
  signed_size_bytes: number | null
  artifact_error: string | null
  completed_at: string | null
  created_at: string
}

function setupStateFor(enabled: boolean): SignatureSetupState {
  if (!enabled) return 'disabled'
  return getProviderConfig().configured ? 'enabled' : 'setup_required'
}

function providerMessage(e: unknown) {
  if (e instanceof ProviderError) {
    if (e.status === 401 || e.status === 403) return 'Dropbox Sign rejected the API credentials. Check DROPBOX_SIGN_API_KEY.'
    if (e.code === 'not_configured') return e.message
    return `Dropbox Sign could not process the request: ${e.message}`
  }
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.'
}

async function loadStaffDocument(documentId: string) {
  const session = await getSession()
  if (!session?.organizationId || !session.role || session.role === 'client') return { error: 'Staff access required.' } as const
  if (!uuid.safeParse(documentId).success) return { error: 'This document is no longer available.' } as const
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('project_documents')
    .select('id, organization_id, project_id, name, scope, archived_at, current_version_id, current_version_number')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc || doc.scope !== 'project' || !doc.project_id) return { error: 'Signatures are available for project documents only.' } as const
  const features = await getOrgFeatures(doc.organization_id)
  return { session, supabase, doc, features } as const
}

async function loadRequestViews(supabase: Awaited<ReturnType<typeof createClient>>, documentId: string): Promise<SignatureRequestView[]> {
  const { data: rows } = await supabase
    .from('signature_requests')
    .select(REQUEST_COLUMNS)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(20)
  const requests = (rows ?? []) as RequestRow[]
  if (!requests.length) return []
  const ids = requests.map((r) => r.id)
  const [{ data: signers }, { data: events }, { data: versions }] = await Promise.all([
    supabase
      .from('signature_request_signers')
      .select('id, request_id, signer_kind, name, email, signing_order, status, signed_at, last_viewed_at, decline_reason, initials_each_page')
      .in('request_id', ids)
      .order('signing_order'),
    supabase.from('signature_events').select('id, request_id, event_type, event_time, source').in('request_id', ids).order('event_time', { ascending: false }),
    supabase.from('project_document_versions').select('id, version_number').in('id', requests.map((r) => r.source_version_id)),
  ])
  const admin = createAdminClient()
  const { data: people } = await admin.from('profiles').select('id, full_name, email').in('id', [...new Set(requests.map((r) => r.requested_by))])

  return requests.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    method: r.signing_method,
    ordered: r.ordered,
    testMode: r.test_mode,
    sourceVersionNumber: versions?.find((v) => v.id === r.source_version_id)?.version_number ?? null,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    requestedBy: people?.find((p) => p.id === r.requested_by)?.full_name || people?.find((p) => p.id === r.requested_by)?.email || 'Team member',
    errorMessage: r.error_message,
    artifactError: r.artifact_error,
    hasSignedPdf: Boolean(r.signed_storage_path),
    signedSizeBytes: r.signed_size_bytes,
    signers: (signers ?? [])
      .filter((s) => s.request_id === r.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        kind: s.signer_kind,
        order: s.signing_order,
        status: s.status as SignerStatus,
        signedAt: s.signed_at,
        lastViewedAt: s.last_viewed_at,
        declineReason: s.decline_reason,
        initials: s.initials_each_page,
      })),
    events: (events ?? [])
      .filter((e) => e.request_id === r.id)
      .map((e) => ({ id: e.id, type: e.event_type, time: e.event_time, source: e.source })),
  }))
}

export type SignaturePanelData = {
  setup: SignatureSetupState
  canManage: boolean
  embeddedAvailable: boolean
  testMode: boolean
  currentVersion: { id: string; number: number; isPdf: boolean; sizeOk: boolean } | null
  hasOpenRequestOnCurrent: boolean
  candidates: EligibleSigner[]
  embeddedReadyKeys: string[]
  requests: SignatureRequestView[]
}

export async function getSignaturePanel(documentId: string): Promise<Result<SignaturePanelData>> {
  const ctx = await loadStaffDocument(documentId)
  if ('error' in ctx) return { ok: false, error: ctx.error ?? 'Request failed.' }
  const { session, supabase, doc, features } = ctx
  const setup = setupStateFor(features.e_signatures)
  const config = getProviderConfig()
  const manager = canManage(session.role)

  const { data: version } = doc.current_version_id
    ? await supabase.from('project_document_versions').select('id, version_number, content_type, size_bytes').eq('id', doc.current_version_id).maybeSingle()
    : { data: null }
  const requests = await loadRequestViews(supabase, doc.id)

  let candidates: EligibleSigner[] = []
  let embeddedReadyKeys: string[] = []
  if (manager && setup === 'enabled' && !doc.archived_at) {
    const admin = createAdminClient()
    const { data: project } = await admin
      .from('projects')
      .select('id, organization_id, primary_client_id, project_manager_id')
      .eq('id', doc.project_id)
      .single()
    const list = await listSignerCandidates(admin, project!)
    candidates = list.map(({ resolved: _r, portalReady: _p, ...c }) => c)
    embeddedReadyKeys = list.filter((c) => c.portalReady).map((c) => c.key)
  }

  return {
    ok: true,
    data: {
      setup,
      canManage: manager,
      embeddedAvailable: config.embeddedAvailable,
      testMode: config.testMode,
      currentVersion: version
        ? { id: version.id, number: version.version_number, isPdf: version.content_type === 'application/pdf', sizeOk: (version.size_bytes ?? 0) <= MAX_SIGNING_PDF_BYTES }
        : null,
      hasOpenRequestOnCurrent: requests.some((r) => OPEN_STATUSES.includes(r.status) && r.sourceVersionNumber === version?.version_number),
      candidates,
      embeddedReadyKeys,
      requests,
    },
  }
}

const createSchema = z.object({
  documentId: uuid,
  versionId: uuid,
  title: z.string().trim().min(1, 'Enter a title.').max(200),
  message: z.string().trim().max(2000).optional(),
  method: z.enum(['email', 'embedded']),
  ordered: z.boolean(),
  signers: z
    .array(z.object({ key: z.string().max(80), initials: z.boolean() }))
    .min(1, 'Add at least one signer.')
    .max(10, 'A request can have up to 10 signers.'),
})

export async function createSignatureRequest(input: z.infer<typeof createSchema>): Promise<Result<{ requestId: string }>> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request details.' }
  const values = parsed.data
  const ctx = await loadStaffDocument(values.documentId)
  if ('error' in ctx) return { ok: false, error: ctx.error ?? 'Request failed.' }
  const { session, supabase, doc, features } = ctx
  if (!canManage(session.role)) return { ok: false, error: 'Only administrators and project managers can request signatures.' }
  if (!features.e_signatures) return { ok: false, error: 'Electronic signatures are turned off for your company.' }
  const config = getProviderConfig()
  if (!config.configured) return { ok: false, error: 'Dropbox Sign is not connected yet. An administrator needs to add the API key.' }
  if (values.method === 'embedded' && !config.embeddedAvailable) return { ok: false, error: 'In-app signing needs DROPBOX_SIGN_CLIENT_ID. Send by email instead.' }
  if (doc.archived_at) return { ok: false, error: 'Archived documents cannot be sent for signature.' }
  if (doc.current_version_id !== values.versionId) return { ok: false, error: 'A newer version was uploaded. Reopen the dialog to sign the current version.' }

  const { data: version } = await supabase
    .from('project_document_versions')
    .select('id, version_number, storage_path, original_filename, content_type, size_bytes')
    .eq('id', values.versionId)
    .maybeSingle()
  if (!version) return { ok: false, error: 'This version is no longer available.' }
  if (version.content_type !== 'application/pdf') return { ok: false, error: 'Only PDF documents can be sent for signature.' }
  if ((version.size_bytes ?? 0) > MAX_SIGNING_PDF_BYTES) return { ok: false, error: 'PDFs sent for signature must be 25 MB or smaller.' }

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id, name, organization_id, primary_client_id, project_manager_id, organizations(display_name, legal_name)')
    .eq('id', doc.project_id)
    .single()
  if (!project) return { ok: false, error: 'Project not found.' }

  const candidates = await listSignerCandidates(admin, project)
  const chosen = []
  const seen = new Set<string>()
  for (const s of values.signers) {
    const c = candidates.find((x) => x.key === s.key)
    if (!c?.resolved) return { ok: false, error: `${c?.name ?? 'A selected signer'} can no longer sign: ${c?.reason ?? 'not eligible for this project'}.` }
    if (values.method === 'embedded' && !c.portalReady) return { ok: false, error: `${c.name} has no portal access to this project, so they cannot sign in the app. Send by email instead.` }
    if (seen.has(c.resolved.email)) return { ok: false, error: `${c.resolved.email} is listed twice.` }
    seen.add(c.resolved.email)
    chosen.push({ ...c.resolved, initials: s.initials, role: c.detail })
  }

  const requestId = crypto.randomUUID()
  const { error: insertError } = await admin.from('signature_requests').insert({
    id: requestId,
    organization_id: doc.organization_id,
    project_id: doc.project_id,
    document_id: doc.id,
    source_version_id: version.id,
    signing_method: values.method,
    ordered: values.ordered,
    status: 'draft',
    title: values.title,
    message: values.message || null,
    test_mode: config.testMode,
    requested_by: session.userId,
    send_claimed_at: new Date().toISOString(),
  })
  if (insertError) {
    if (insertError.code === '23505') return { ok: false, error: 'This version already has an open signature request. Cancel it before sending another.' }
    console.error('[esign] insert request failed', insertError.message)
    return { ok: false, error: 'The request could not be created. Please try again.' }
  }
  const { error: signerError } = await admin.from('signature_request_signers').insert(
    chosen.map((s, i) => ({
      request_id: requestId,
      organization_id: doc.organization_id,
      project_id: doc.project_id,
      signer_kind: s.kind,
      contact_id: s.contactId,
      user_id: s.userId,
      name: s.name,
      email: s.email,
      signing_order: i,
      initials_each_page: s.initials,
      status: values.ordered && i > 0 ? 'on_hold' : 'awaiting',
    })),
  )
  const fail = async (message: string) => {
    await admin.from('signature_requests').update({ status: 'failed', error_message: message }).eq('id', requestId)
    revalidatePath(`/projects/${doc.project_id}/documents`)
    return { ok: false as const, error: message }
  }
  if (signerError) return fail('Signers could not be saved. Please try again.')

  try {
    const { data: file, error: dlError } = await admin.storage.from(DOCUMENTS_BUCKET).download(version.storage_path)
    if (dlError || !file) return fail('The PDF could not be read from storage.')
    const source = new Uint8Array(await file.arrayBuffer())
    const org = (Array.isArray(project.organizations) ? project.organizations[0] : project.organizations) as { display_name?: string; legal_name?: string } | null
    const packet = await buildSigningPacket(source, {
      documentName: doc.name,
      versionNumber: version.version_number,
      projectName: project.name,
      organizationName: org?.display_name || org?.legal_name || 'Your builder',
      signers: chosen.map((s) => ({ name: s.name, role: s.kind === 'homeowner' ? `Homeowner · ${s.role}` : s.role, initials: s.initials })),
    })
    const sr = await providerCreate({
      embedded: values.method === 'embedded',
      title: values.title,
      message: values.message || null,
      ordered: values.ordered,
      signers: chosen.map((s) => ({ name: s.name, email: s.email })),
      file: packet,
      filename: version.original_filename?.toLowerCase().endsWith('.pdf') ? version.original_filename : `${doc.name}.pdf`,
      metadata: { bj_request_id: requestId },
    })
    await admin.from('signature_requests').update({ provider_request_id: sr.signature_request_id, test_mode: sr.test_mode }).eq('id', requestId)
    const row = { id: requestId, organization_id: doc.organization_id, project_id: doc.project_id, status: 'draft' as SignatureStatus, title: values.title, requested_by: session.userId, signed_storage_path: null }
    await applyProviderState(admin, row, sr)
    await recordEvent(admin, row, { key: `app:${requestId}:sent`, type: 'request_sent', time: new Date(), source: 'app', details: { signers: chosen.length, method: values.method } })
  } catch (e) {
    console.error('[esign] send failed', requestId, e instanceof Error ? e.message : e)
    return fail(providerMessage(e))
  }

  revalidatePath(`/projects/${doc.project_id}/documents`)
  return { ok: true, data: { requestId } }
}

async function loadManagedRequest(requestId: string) {
  const session = await getSession()
  if (!session?.organizationId || !canManage(session.role)) return { error: 'Only administrators and project managers can manage signature requests.' } as const
  if (!uuid.safeParse(requestId).success) return { error: 'Request not found.' } as const
  const supabase = await createClient()
  const { data } = await supabase.from('signature_requests').select(REQUEST_COLUMNS).eq('id', requestId).maybeSingle()
  if (!data) return { error: 'Request not found.' } as const
  return { session, row: data as RequestRow } as const
}

export async function refreshSignatureRequest(requestId: string): Promise<Result<{ status: SignatureStatus }>> {
  const ctx = await loadManagedRequest(requestId)
  if ('error' in ctx) return { ok: false, error: ctx.error ?? 'Request failed.' }
  const { row } = ctx
  if (!row.provider_request_id) return { ok: false, error: 'This request was never delivered to Dropbox Sign.' }
  if (!getProviderConfig().configured) return { ok: false, error: 'Dropbox Sign is not connected.' }
  try {
    const admin = createAdminClient()
    const sr = await providerGet(row.provider_request_id)
    const result = await applyProviderState(admin, row, sr)
    if (result.status !== row.status) {
      await recordEvent(admin, row, { key: `sync:${row.id}:${result.status}`, type: 'status_refreshed', time: new Date(), source: 'sync', details: { from: row.status, to: result.status } })
    }
    revalidatePath(`/projects/${row.project_id}/documents`)
    return { ok: true, data: { status: result.status } }
  } catch (e) {
    return { ok: false, error: providerMessage(e) }
  }
}

export async function cancelSignatureRequestAction(requestId: string): Promise<Result<null>> {
  const ctx = await loadManagedRequest(requestId)
  if ('error' in ctx) return { ok: false, error: ctx.error ?? 'Request failed.' }
  const { row, session } = ctx
  if (!OPEN_STATUSES.includes(row.status)) return { ok: false, error: 'Only open requests can be cancelled.' }
  const admin = createAdminClient()
  if (row.provider_request_id) {
    try {
      await providerCancel(row.provider_request_id)
    } catch (e) {
      try {
        const sr = await providerGet(row.provider_request_id)
        const result = await applyProviderState(admin, row, sr)
        if (!OPEN_STATUSES.includes(result.status)) return { ok: false, error: 'This request already finished, so it was not cancelled. The status has been refreshed.' }
      } catch {}
      return { ok: false, error: providerMessage(e) }
    }
  }
  await admin.from('signature_requests').update({ status: 'cancelled' }).eq('id', row.id).in('status', OPEN_STATUSES)
  await recordEvent(admin, row, { key: `app:${row.id}:cancelled`, type: 'cancelled_by_staff', time: new Date(), source: 'app', details: { by: session.userId } })
  revalidatePath(`/projects/${row.project_id}/documents`)
  return { ok: true, data: null }
}

export async function getSignedPdfUrl(requestId: string, mode: 'preview' | 'download'): Promise<Result<{ url: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Sign in required.' }
  if (!uuid.safeParse(requestId).success) return { ok: false, error: 'Signed document not found.' }
  const supabase = await createClient()
  const { data: row } = await supabase.from('signature_requests').select('id, title, signed_storage_path').eq('id', requestId).maybeSingle()
  if (!row?.signed_storage_path) return { ok: false, error: 'The signed PDF is not available yet.' }
  const safeName = `${row.title.replace(/[^\w .-]+/g, '').trim() || 'document'} (signed).pdf`
  const { data, error } = await createAdminClient()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUrl(row.signed_storage_path, mode === 'preview' ? 300 : 60, mode === 'download' ? { download: safeName } : undefined)
  if (error || !data?.signedUrl) return { ok: false, error: 'The signed PDF could not be retrieved. Please try again.' }
  return { ok: true, data: { url: data.signedUrl } }
}

export type MySignatureTask = {
  signerId: string
  requestId: string
  title: string
  documentName: string
  status: SignerStatus
  requestStatus: SignatureStatus
  canSignNow: boolean
  waitingReason: string | null
  method: SigningMethod
  hasSignedPdf: boolean
  signedAt: string | null
}

/** Signature tasks for the signed-in user on one project. RLS limits rows to the user's own signer records. */
export async function getMySignatureTasks(projectId: string): Promise<MySignatureTask[]> {
  const session = await getSession()
  if (!session || !uuid.safeParse(projectId).success) return []
  const supabase = await createClient()
  const { data: mine } = await supabase
    .from('signature_request_signers')
    .select('id, request_id, status, signing_order, signed_at')
    .eq('project_id', projectId)
    .eq('user_id', session.userId)
  if (!mine?.length) return []
  const { data: requests } = await supabase
    .from('signature_requests')
    .select('id, title, status, signing_method, ordered, signed_storage_path, document_id, created_at')
    .in('id', mine.map((m) => m.request_id))
    .order('created_at', { ascending: false })
  if (!requests?.length) return []
  const admin = createAdminClient()
  const [{ data: docs }, { data: all }] = await Promise.all([
    admin.from('project_documents').select('id, name').in('id', requests.map((r) => r.document_id)),
    admin.from('signature_request_signers').select('request_id, signing_order, status').in('request_id', requests.map((r) => r.id)),
  ])
  const embeddedReady = getProviderConfig().embeddedAvailable
  return requests.flatMap((r) => {
    const me = mine.find((m) => m.request_id === r.id)
    if (!me) return []
    const open = OPEN_STATUSES.includes(r.status as SignatureStatus)
    const earlierPending = r.ordered && (all ?? []).some((s) => s.request_id === r.id && s.signing_order < me.signing_order && s.status !== 'signed')
    let waitingReason: string | null = null
    if (open && me.status !== 'signed') {
      if (r.signing_method === 'email') waitingReason = 'Check your email for the signing link from Dropbox Sign.'
      else if (earlierPending) waitingReason = 'Waiting for earlier signers.'
      else if (!embeddedReady) waitingReason = 'In-app signing is temporarily unavailable.'
    }
    return [{
      signerId: me.id,
      requestId: r.id,
      title: r.title,
      documentName: docs?.find((d) => d.id === r.document_id)?.name ?? r.title,
      status: me.status as SignerStatus,
      requestStatus: r.status as SignatureStatus,
      canSignNow: open && me.status !== 'signed' && me.status !== 'declined' && !waitingReason,
      waitingReason,
      method: r.signing_method as SigningMethod,
      hasSignedPdf: Boolean(r.signed_storage_path),
      signedAt: me.signed_at,
    }]
  })
}

async function loadMySigner(signerId: string) {
  const session = await getSession()
  if (!session) return { error: 'Sign in required.' } as const
  if (!uuid.safeParse(signerId).success) return { error: 'Signing task not found.' } as const
  const supabase = await createClient()
  const { data: signer } = await supabase
    .from('signature_request_signers')
    .select('id, request_id, user_id, status, signing_order, provider_signature_id')
    .eq('id', signerId)
    .eq('user_id', session.userId)
    .maybeSingle()
  if (!signer) return { error: 'Signing task not found.' } as const
  const { data: row } = await supabase.from('signature_requests').select(REQUEST_COLUMNS).eq('id', signer.request_id).maybeSingle()
  if (!row) return { error: 'You no longer have access to this document.' } as const
  return { session, signer, row: row as RequestRow } as const
}

export async function getSigningSession(signerId: string): Promise<Result<{ signUrl: string; clientId: string; testMode: boolean }>> {
  const ctx = await loadMySigner(signerId)
  if ('error' in ctx) return { ok: false, error: ctx.error ?? 'Request failed.' }
  const { signer, row } = ctx
  const features = await getOrgFeatures(row.organization_id)
  const config = getProviderConfig()
  if (!features.e_signatures || !config.embeddedAvailable || !config.clientId) return { ok: false, error: 'In-app signing is not available right now.' }
  if (row.signing_method !== 'embedded') return { ok: false, error: 'This document is signed through the link sent by email.' }
  if (!OPEN_STATUSES.includes(row.status)) return { ok: false, error: 'This request is no longer open for signing.' }
  if (signer.status === 'signed') return { ok: false, error: 'You have already signed this document.' }
  if (!signer.provider_signature_id) return { ok: false, error: 'This signing task is still being prepared. Try again in a moment.' }
  if (row.ordered) {
    const { data: earlier } = await createAdminClient()
      .from('signature_request_signers')
      .select('status')
      .eq('request_id', row.id)
      .lt('signing_order', signer.signing_order)
    if (earlier?.some((s) => s.status !== 'signed')) return { ok: false, error: 'Earlier signers need to sign first.' }
  }
  try {
    const { signUrl } = await getEmbeddedSignUrl(signer.provider_signature_id)
    return { ok: true, data: { signUrl, clientId: config.clientId, testMode: row.test_mode } }
  } catch (e) {
    return { ok: false, error: providerMessage(e) }
  }
}

/** Called after the signing window closes. Re-reads provider state so the UI reflects the result without waiting for the webhook. */
export async function syncAfterSigning(signerId: string): Promise<Result<{ status: SignerStatus }>> {
  const ctx = await loadMySigner(signerId)
  if ('error' in ctx) return { ok: false, error: ctx.error ?? 'Request failed.' }
  const { row, signer } = ctx
  if (!row.provider_request_id || !getProviderConfig().configured) return { ok: true, data: { status: signer.status as SignerStatus } }
  try {
    const admin = createAdminClient()
    await applyProviderState(admin, row, await providerGet(row.provider_request_id))
    const { data } = await admin.from('signature_request_signers').select('status').eq('id', signer.id).single()
    revalidatePath(`/portal/projects/${row.project_id}/documents`)
    revalidatePath(`/projects/${row.project_id}/documents`)
    return { ok: true, data: { status: (data?.status ?? signer.status) as SignerStatus } }
  } catch {
    return { ok: true, data: { status: signer.status as SignerStatus } }
  }
}
