import { absoluteAppLink, preferencesPathFor } from './links.ts'
import { categoryLabel, isRequiredEmailCategory } from './categories.ts'

export type OutboxTemplate = 'notification' | 'staff_invitation' | 'client_invitation' | 'portal_access' | 'welcome'

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

const BRAND = {
  teal: '#00788D',
  tealDark: '#005f70',
  orange: '#FFA500',
  ink: '#17212b',
  body: '#3a4652',
  muted: '#66717c',
  page: '#eef3f4',
  panel: '#f3f7f8',
  rule: '#e3e9ec',
}

/** Who runs Trefort, shown under every email. Kept in step with lib/legal.ts. */
const OPERATOR = 'Neovel Technologies Group LLC'

function layoutHtml(l: Layout, appUrl: string): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
  const lines = l.lines.map((line) => `<p style="margin:0 0 10px;font-size:15px;line-height:23px;color:${BRAND.body}">${escapeHtml(line)}</p>`).join('')
  const detail = l.detail
    ? `<div style="margin:18px 0 0;padding:16px 18px;border-radius:10px;background:${BRAND.panel};border-left:3px solid ${BRAND.teal};font-size:14px;line-height:22px;color:${BRAND.body};white-space:pre-line">${escapeHtml(l.detail)}</div>`
    : ''
  const notes = l.notes.map((n) => `<p style="margin:0 0 6px;font-size:13px;line-height:20px;color:${BRAND.muted}">${escapeHtml(n)}</p>`).join('')
  const logo = `${appUrl}/branding/trefort-logo.png`
  const terms = `${appUrl}/terms`
  const privacy = `${appUrl}/privacy`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(l.heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:${font}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BRAND.rule}">
<tr><td style="background:${BRAND.teal};padding:22px 28px"><img src="${escapeHtml(logo)}" width="150" height="40" alt="Trefort" style="display:block;border:0;outline:none;width:150px;height:auto;color:#ffffff;font-size:22px;font-weight:700;font-family:${font}"></td></tr>
<tr><td style="padding:26px 28px 0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.tealDark}">${escapeHtml(l.eyebrow)}</td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="margin:0 0 14px;font-size:22px;line-height:29px;font-weight:700;color:${BRAND.ink}">${escapeHtml(l.heading)}</h1>${lines}${detail}</td></tr>
<tr><td style="padding:24px 28px 8px"><a href="${escapeHtml(l.buttonUrl)}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:${BRAND.orange};color:${BRAND.ink};font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(l.buttonLabel)}</a></td></tr>
<tr><td style="padding:12px 28px 24px">${notes}</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${BRAND.rule};font-size:12px;line-height:19px;color:${BRAND.muted}">
<p style="margin:0 0 8px">${escapeHtml(l.footer)}</p>
<p style="margin:0">Trefort is construction management software by ${escapeHtml(OPERATOR)}. <a href="${escapeHtml(terms)}" style="color:${BRAND.tealDark};text-decoration:underline">Terms</a> · <a href="${escapeHtml(privacy)}" style="color:${BRAND.tealDark};text-decoration:underline">Privacy</a></p>
</td></tr>
</table></td></tr></table></body></html>`
}

function layoutText(l: Layout): string {
  return [
    'TREFORT',
    '',
    l.eyebrow,
    '',
    l.heading,
    '',
    ...l.lines,
    ...(l.detail ? ['', l.detail] : []),
    '',
    `${l.buttonLabel}: ${l.buttonUrl}`,
    '',
    ...l.notes,
    '',
    '--',
    l.footer,
    `Trefort is construction management software by ${OPERATOR}.`,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

function renderLayout(subject: string, layout: Layout, appUrl: string): RenderResult {
  if (!subject) return { ok: false, error: 'template_missing_subject' }
  return { ok: true, email: { subject, html: layoutHtml(layout, appUrl), text: layoutText(layout) } }
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
  const render = (subject: string, layout: Layout) => renderLayout(subject, layout, appUrl)
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

  if (row.template === 'welcome') {
    const url = absoluteAppLink(appUrl, '/dashboard')
    if (!url) return { ok: false, error: 'template_unsafe_link' }
    const company = str(p.organization_name, 120) || 'your company'
    const first = str(p.first_name, 60)
    const trialEnds = formatDate(p.trial_ends_at)
    return render(subjectLine([`Welcome to Trefort, ${first || company}`]), {
      preheader: 'Your workspace is ready, with a sample project to explore.',
      eyebrow: 'Trefort',
      heading: first ? `Welcome, ${first}. Your workspace is ready.` : 'Your Trefort workspace is ready',
      lines: [
        `${company} is set up on Trefort${trialEnds ? `, with every module free until ${trialEnds}` : ''}. No credit card is needed during the trial.`,
        'We added a sample project, the Harper Residence, so you can see a job in progress before you enter your own.',
      ],
      detail: [
        'Getting started (about 15 minutes):',
        '1. Open the sample project and look around: estimate, schedule, daily logs, change order and draws.',
        '2. Add your logo and company details in Settings.',
        '3. Review which modules your team uses.',
        '4. Create your first real project.',
        '5. Invite your project managers and field staff.',
      ].join('\n'),
      buttonLabel: 'Open your dashboard',
      buttonUrl: url,
      notes: [
        'The checklist on your dashboard tracks these steps. You can archive the sample project any time.',
        'Questions? Reply to this email and a person will answer.',
      ],
      footer: 'You received this because you created a company workspace on Trefort.',
    })
  }

  return { ok: false, error: 'template_unknown' }
}
