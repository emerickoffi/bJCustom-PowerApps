import { absoluteAppLink, preferencesPathFor } from './links.ts'
import { categoryLabel, isRequiredEmailCategory } from './categories.ts'

export type OutboxTemplate = 'notification' | 'staff_invitation' | 'client_invitation' | 'portal_access'

export type OutboxRow = {
  id: number
  event_key: string
  organization_id: string
  template: OutboxTemplate
  category: string
  recipient_email: string | null
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

export type RenderedEmail = { subject: string; html: string; text: string }
export type RenderResult = { ok: true; email: RenderedEmail } | { ok: false; error: string }

const MAX_SUBJECT = 140

function str(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : ''
}

function multiline(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function subjectLine(parts: string[]): string {
  const subject = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return subject.length > MAX_SUBJECT ? `${subject.slice(0, MAX_SUBJECT - 1)}…` : subject
}

const ACTION_LABELS: Record<string, string> = {
  subcontract_quote: 'View quote request',
  rfi: 'View RFI',
  change_order: 'Review change order',
  invoice: 'View invoice',
  invoice_reminder: 'View invoice',
  signature_request: 'Review and sign',
  subcontractor_work: 'View assigned work',
}

function actionLabel(kind: string): string {
  if (ACTION_LABELS[kind]) return ACTION_LABELS[kind]
  if (kind.startsWith('issue')) return 'View punch list item'
  return 'Open in Trefort'
}

type Layout = {
  preheader: string
  eyebrow: string
  heading: string
  lines: string[]
  detail?: string
  buttonLabel: string
  buttonUrl: string
  notes: string[]
  footer: string
}

function layoutHtml(l: Layout): string {
  const lines = l.lines.map((line) => `<p style="margin:0 0 8px;font-size:15px;line-height:22px;color:#3f3a33">${escapeHtml(line)}</p>`).join('')
  const detail = l.detail
    ? `<div style="margin:16px 0 0;padding:14px 16px;border-radius:10px;background:#f4f1ea;font-size:14px;line-height:21px;color:#3f3a33;white-space:pre-line">${escapeHtml(l.detail)}</div>`
    : ''
  const notes = l.notes.map((n) => `<p style="margin:0 0 6px;font-size:13px;line-height:19px;color:#6b645a">${escapeHtml(n)}</p>`).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(l.heading)}</title></head>
<body style="margin:0;padding:0;background:#efebe3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efebe3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px">
<tr><td style="padding:24px 28px 0;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#7a6a4f">${escapeHtml(l.eyebrow)}</td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="margin:0 0 14px;font-size:21px;line-height:28px;color:#1f1c18">${escapeHtml(l.heading)}</h1>${lines}${detail}</td></tr>
<tr><td style="padding:22px 28px 6px"><a href="${escapeHtml(l.buttonUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1f2a24;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(l.buttonLabel)}</a></td></tr>
<tr><td style="padding:10px 28px 22px">${notes}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #ece7dd;font-size:12px;line-height:18px;color:#8a8378">${escapeHtml(l.footer)}</td></tr>
</table></td></tr></table></body></html>`
}

function layoutText(l: Layout): string {
  return [l.eyebrow, '', l.heading, '', ...l.lines, ...(l.detail ? ['', l.detail] : []), '', `${l.buttonLabel}: ${l.buttonUrl}`, '', ...l.notes, '', '--', l.footer]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

function render(subject: string, layout: Layout): RenderResult {
  if (!subject) return { ok: false, error: 'template_missing_subject' }
  return { ok: true, email: { subject, html: layoutHtml(layout), text: layoutText(layout) } }
}

function formatDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function notificationFooter(row: OutboxRow, appUrl: string, org: string, link: string): string {
  if (isRequiredEmailCategory(row.category)) {
    return `This is a required ${categoryLabel(row.category).toLowerCase()} notice from ${org} sent through Trefort.`
  }
  const prefPath = preferencesPathFor(link)
  const prefUrl = prefPath ? absoluteAppLink(appUrl, prefPath) : null
  return prefUrl
    ? `You're receiving this because ${categoryLabel(row.category).toLowerCase()} emails are on. Change email preferences: ${prefUrl}`
    : `You're receiving this as a ${org} trade partner. Reply to this email to ask ${org} to stop these messages.`
}

export function renderEmail(row: OutboxRow, appUrl: string): RenderResult {
  const p = row.payload ?? {}
  const org = str(p.organization_name, 120) || 'Your builder'

  if (row.template === 'notification') {
    const title = str(p.title, 160)
    if (!title) return { ok: false, error: 'template_missing_title' }
    const kind = str(p.kind, 60)
    const linkPath = str(p.link, 500) || '/'
    const url = absoluteAppLink(appUrl, linkPath)
    if (!url) return { ok: false, error: 'template_unsafe_link' }
    const action = p.action_required === true
    const project = str(p.project_name, 160)
    const lines = [
      project ? `Project: ${project}` : '',
      action ? 'This needs your attention.' : '',
    ].filter(Boolean)
    return render(subjectLine([action ? 'Action required:' : '', title]), {
      preheader: multiline(p.body, 140) || title,
      eyebrow: org,
      heading: title,
      lines,
      detail: multiline(p.body) || undefined,
      buttonLabel: actionLabel(kind),
      buttonUrl: url,
      notes: ['Sign in to Trefort to see the full details. Trefort will never ask for your password by email.'],
      footer: notificationFooter(row, appUrl, org, linkPath),
    })
  }

  if (row.template === 'staff_invitation' || row.template === 'client_invitation') {
    const url = absoluteAppLink(appUrl, str(p.link, 500))
    if (!url || !url.includes('/invite/')) return { ok: false, error: 'template_unsafe_link' }
    const expires = formatDate(p.expires_at)
    const staff = row.template === 'staff_invitation'
    const role = str(p.role_label, 60)
    return render(subjectLine([staff ? `You're invited to join ${org} on Trefort` : `Your home project portal from ${org}`]), {
      preheader: staff ? `${org} invited you to their Trefort workspace.` : `${org} invited you to follow your project in Trefort.`,
      eyebrow: org,
      heading: staff ? `Join ${org} on Trefort` : 'Your project portal is ready',
      lines: staff
        ? [`${org} invited you to their Trefort workspace${role ? ` as ${role}` : ''}.`]
        : [`${org} invited you to the homeowner portal, where you can follow progress, review documents, and pay invoices.`],
      buttonLabel: 'Accept invitation',
      buttonUrl: url,
      notes: [
        expires ? `This link expires on ${expires} and works once.` : 'This link works once.',
        "If you weren't expecting this invitation, you can ignore this email.",
      ],
      footer: `Sent by Trefort on behalf of ${org}.`,
    })
  }

  if (row.template === 'portal_access') {
    const url = absoluteAppLink(appUrl, '/auth/login?next=/sub')
    if (!url) return { ok: false, error: 'template_unsafe_link' }
    const company = str(p.company_name, 160)
    return render(subjectLine([`You now have access to the ${org} trade partner portal`]), {
      preheader: `Sign in to see quote requests and assigned work from ${org}.`,
      eyebrow: org,
      heading: 'Trade partner portal access',
      lines: [
        `${org} gave you access to their Trefort trade partner portal${company ? ` for ${company}` : ''}.`,
        'Use it to answer quote requests, respond to RFIs, and update assigned work.',
      ],
      buttonLabel: 'Sign in',
      buttonUrl: url,
      notes: [
        p.temporary_password === true
          ? `${org} will share your temporary password separately. You'll choose your own password after signing in.`
          : 'Sign in with your existing Trefort account.',
        'Trefort will never email you a password.',
      ],
      footer: `Sent by Trefort on behalf of ${org}. Reply to this email if you think you received it in error.`,
    })
  }

  return { ok: false, error: 'template_unknown' }
}
