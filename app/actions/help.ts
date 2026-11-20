'use server'

import { after } from 'next/server'
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/session'
import { getSubcontractorSession } from '@/lib/subcontractor-session'
import { isAllowedRecipient, resolveEmailConfig } from '@/lib/email/config'
import { createResendSender } from '@/lib/email/resend'
import { renderSupportTicketEmails } from '@/lib/email/templates'
import { describeBrowser, SUPPORT_EMAIL, SUPPORT_RESPONSE_PROMISE, type HelpArea } from '@/lib/help-topics'
import { isSupportDuration, supportDbMessage } from '@/lib/support-access-shared'

export type HelpRequestResult =
  | { ok: true; reference: string; emailedTo: string | null; warning?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const schema = z.object({
  area: z.enum(['staff', 'portal', 'sub', 'public']),
  subject: z.string().trim().min(3, 'Say in a few words what you were trying to do.').max(140, 'Keep the summary under 140 characters.'),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(4000, 'Keep the message under 4,000 characters.'),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(254).optional(),
  pagePath: z.string().max(500).optional(),
  projectId: z.string().uuid().optional(),
  lastError: z.string().max(1000).optional(),
  grantMinutes: z.number().optional(),
  /** Honeypot: people never see this field, so anything in it came from a bot. */
  website: z.string().optional(),
})

export type HelpRequestInput = z.input<typeof schema>

function supportInbox(): string {
  return process.env.SUPPORT_INBOX?.trim() || SUPPORT_EMAIL
}

async function clientInfo() {
  const h = await headers()
  const userAgent = (h.get('user-agent') ?? '').slice(0, 500)
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || ''
  const salt = process.env.HELP_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'trefort-help'
  const ipHash = ip ? createHash('sha256').update(`${salt}:${ip}`).digest('hex') : null
  return { userAgent, ipHash }
}

type EmailJob = {
  ticketId: string
  reference: string
  subject: string
  message: string
  requesterName: string | null
  requesterEmail: string
  requesterRole: string | null
  organizationName: string | null
  projectName: string | null
  pagePath: string | null
  browser: string | null
  lastError: string | null
  supportAccessMinutes: number | null
  /** Only signed-in people get a receipt, so the form cannot be used to send mail to strangers. */
  sendReceipt: boolean
}

/** Runs after the response. The ticket is already saved, so a failed email never loses the request. */
async function sendHelpEmails(job: EmailJob) {
  const config = resolveEmailConfig()
  const admin = createAdminClient()
  const setStatus = (status: 'sent' | 'failed' | 'not_configured') =>
    admin.rpc('set_support_ticket_email_status', { p_ticket: job.ticketId, p_status: status })

  if (!config.ready || !config.apiKey || !config.from || !config.appUrl) {
    await setStatus('not_configured')
    return
  }
  const send = createResendSender(config.apiKey)
  const { toSupport, receipt } = renderSupportTicketEmails({ ...job, responsePromise: SUPPORT_RESPONSE_PROMISE }, config.appUrl)

  let ok = false
  const inbox = supportInbox()
  if (toSupport.ok && isAllowedRecipient(inbox, config.allowlist)) {
    const result = await send(
      { from: config.from, to: inbox, replyTo: job.requesterEmail, ...toSupport.email, tags: [{ name: 'category', value: 'help_request' }] },
      `help-${job.ticketId}-support`,
    )
    ok = result.outcome === 'accepted'
    if (!ok) console.error('[help] support email not sent', { reference: job.reference, outcome: result.outcome })
  }
  if (job.sendReceipt && receipt.ok && isAllowedRecipient(job.requesterEmail, config.allowlist)) {
    const result = await send(
      { from: config.from, to: job.requesterEmail, replyTo: inbox, ...receipt.email, tags: [{ name: 'category', value: 'help_receipt' }] },
      `help-${job.ticketId}-receipt`,
    )
    if (result.outcome !== 'accepted') console.error('[help] receipt not sent', { reference: job.reference, outcome: result.outcome })
  }
  await setStatus(ok ? 'sent' : 'failed')
}

export async function submitHelpRequestAction(input: HelpRequestInput): Promise<HelpRequestResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.', fieldErrors }
  }
  const data = parsed.data
  if (data.website) return { ok: true, reference: 'HELP-0', emailedTo: null }

  const { userAgent, ipHash } = await clientInfo()
  const browser = userAgent ? describeBrowser(userAgent) : null
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()

  // ───────── Signed out (sign-in and invitation pages) ─────────
  if (!auth.user) {
    const email = (data.email ?? '').toLowerCase()
    if (!z.string().email().safeParse(email).success) {
      return { ok: false, error: 'Enter your email address so we can reply.', fieldErrors: { email: 'Enter a valid email address.' } }
    }
    const admin = createAdminClient()
    const { data: row, error } = await admin.rpc('create_public_support_ticket', {
      p_name: data.name ?? null,
      p_email: email,
      p_subject: data.subject,
      p_message: data.message,
      p_page_path: data.pagePath ?? null,
      p_user_agent: userAgent,
      p_last_error: data.lastError ?? null,
      p_ip_hash: ipHash,
    })
    if (error || !row) return { ok: false, error: supportDbMessage(error?.message) }
    const ticket = row as { id: string; reference: string; requester_email: string }
    after(() =>
      sendHelpEmails({
        ticketId: ticket.id,
        reference: ticket.reference,
        subject: data.subject,
        message: data.message,
        requesterName: data.name ?? null,
        requesterEmail: ticket.requester_email,
        requesterRole: null,
        organizationName: null,
        projectName: null,
        pagePath: data.pagePath ?? null,
        browser,
        lastError: data.lastError ?? null,
        supportAccessMinutes: null,
        sendReceipt: false,
      }).catch((e) => console.error('[help] email job failed', e instanceof Error ? e.name : 'unknown')),
    )
    return { ok: true, reference: ticket.reference, emailedTo: null }
  }

  // ───────── Signed in ─────────
  // The company comes from the session, never from the form; the database checks membership again.
  let area: Exclude<HelpArea, 'public'> = data.area === 'public' ? 'staff' : data.area
  let organizationId: string | null = null
  let organizationName: string | null = null
  let staffRole: string | null = null
  if (area === 'sub') {
    const sub = await getSubcontractorSession()
    organizationId = sub?.accounts[0]?.organizationId ?? null
  } else {
    const session = await getSession()
    organizationId = session?.organizationId ?? null
    organizationName = session?.workspaces.find((w) => w.organizationId === organizationId)?.organizationName ?? null
    if (session?.role === 'client') area = 'portal'
    else staffRole = session?.role ?? null
  }

  const grantMinutes = data.grantMinutes && isSupportDuration(data.grantMinutes) ? data.grantMinutes : null
  const { data: row, error } = await supabase.rpc('create_support_ticket', {
    p_area: area,
    p_subject: data.subject,
    p_message: data.message,
    p_organization: organizationId,
    p_project: data.projectId ?? null,
    p_page_path: data.pagePath ?? null,
    p_user_agent: userAgent,
    p_last_error: data.lastError ?? null,
    p_context: { browser },
    p_grant_minutes: grantMinutes,
  })
  if (error || !row) return { ok: false, error: supportDbMessage(error?.message) }
  const ticket = row as { id: string; reference: string; requester_email: string; grant_id: string | null; grant_error: string | null }

  let projectName: string | null = null
  if (data.projectId) {
    const { data: project } = await supabase.from('projects').select('name').eq('id', data.projectId).maybeSingle()
    projectName = project?.name ?? null
  }
  const granted = ticket.grant_id ? grantMinutes : null
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', auth.user.id).maybeSingle()

  after(() =>
    sendHelpEmails({
      ticketId: ticket.id,
      reference: ticket.reference,
      subject: data.subject,
      message: data.message,
      requesterName: profile?.full_name ?? null,
      requesterEmail: ticket.requester_email,
      requesterRole: area === 'sub' ? 'subcontractor' : area === 'portal' ? 'homeowner' : staffRole,
      organizationName,
      projectName,
      pagePath: data.pagePath ?? null,
      browser,
      lastError: data.lastError ?? null,
      supportAccessMinutes: granted,
      sendReceipt: true,
    }).catch((e) => console.error('[help] email job failed', e instanceof Error ? e.name : 'unknown')),
  )

  return {
    ok: true,
    reference: ticket.reference,
    emailedTo: ticket.requester_email,
    warning:
      grantMinutes && ticket.grant_error
        ? `Your request was sent, but support access was not turned on: ${supportDbMessage(ticket.grant_error)}`
        : undefined,
  }
}
