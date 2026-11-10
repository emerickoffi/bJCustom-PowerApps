'use client'

// Temporary verification harness: answers the preview API with canned data. Deleted before commit.
type Win = Window & { __previewMock?: boolean; __previewCalls?: string[]; __previewFailures?: Record<string, number> }

const photo = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="${color}"/></svg>`)}`

function mock(id: string, n: number) {
  const base = `/projects/${id}`
  if (n === 2) {
    return {
      id,
      summary: { address: null, managerName: null, dateLabel: 'Target completion', dateValue: null },
      attention: { items: [], hiddenCount: 0, incomplete: false },
      nextActivity: { state: 'complete', scheduleHref: `${base}/schedule` },
      latestUpdate: { state: 'empty' },
    }
  }
  if (n === 3) {
    return {
      id,
      summary: { address: '88 Retry Road, Austin, TX 78701', managerName: 'Name unavailable', dateLabel: 'Completed', dateValue: null },
      attention: { items: [], hiddenCount: 0, incomplete: true },
      nextActivity: { state: 'error', scheduleHref: `${base}/schedule` },
      latestUpdate: { state: 'error' },
    }
  }
  if (n === 5) {
    return {
      id,
      summary: { address: '5 Minimal Way, Dallas, TX 75001', managerName: 'Dana Whitfield', dateLabel: 'Target completion', dateValue: 'Mar 3, 2027' },
      attention: {
        items: [
          { key: 'open-issues', tone: 'review', title: 'Open issue: Cracked tile in primary bath', description: 'Record corrective work and approve repairs for homeowner confirmation.', href: `${base}/issues/x`, actionLabel: 'Open issue' },
        ],
        hiddenCount: 0,
        incomplete: true,
      },
      nextActivity: { state: 'off', scheduleHref: `${base}/schedule` },
      latestUpdate: { state: 'off' },
    }
  }
  return {
    id,
    summary: {
      address: `${n}00 Long Meadow Ridge Parkway, Suite ${n}, Round Rock, TX 78664`,
      managerName: 'Morgan Castellanos-Whitaker',
      dateLabel: 'Target completion',
      dateValue: 'Dec 18, 2026',
    },
    attention: {
      items: [
        { key: 'late-activities', tone: 'critical', title: `Update Framing inspection (project ${n})`, description: 'Delayed or past the planned finish · planned finish Due Nov 2, 2026. Update progress, status, or dates.', href: `${base}/schedule`, actionLabel: 'Update schedule' },
        { key: 'estimate-review', tone: 'review', title: '2 estimates are in internal review', description: 'Return to draft or submit for homeowner review.', href: `/estimates?project=${id}`, actionLabel: 'Review estimates' },
        { key: 'signatures-pending', tone: 'review', title: '1 document is awaiting signatures', description: 'Track who has signed and who is still pending.', href: `${base}/documents`, actionLabel: 'Track signatures' },
      ],
      hiddenCount: 1,
      incomplete: false,
    },
    nextActivity: {
      state: 'ready',
      scheduleHref: `${base}/schedule`,
      href: `${base}/schedule?activity=a${n}`,
      name: `Rough plumbing and mechanical inspection ${n}`,
      milestone: n % 2 === 0,
      plannedLabel: 'Oct 28, 2026 – Nov 2, 2026',
      status: 'in_progress',
      overdue: true,
      assigneeName: n % 3 === 0 ? null : 'Jordan Ellis',
    },
    latestUpdate: {
      state: 'ready',
      href: `${base}/daily-logs/l${n}`,
      dateLabel: 'Nov 6, 2026',
      draft: n % 2 === 1,
      summary: `Project ${n}: crew finished second-floor framing, set trusses over the garage, and started sheathing the north elevation. Inspector confirmed the hold-down hardware. Lumber delivery for the porch arrives Monday.`,
      photos: [
        { id: 'p1', url: photo('#7aa2c4'), alt: 'Framing' },
        { id: 'p2', url: photo('#c4a27a'), alt: 'Trusses' },
        { id: 'p3', url: '/missing-photo.jpg', alt: 'Broken photo' },
      ],
      morePhotos: 4,
    },
  }
}

if (typeof window !== 'undefined' && !(window as Win).__previewMock) {
  const win = window as Win
  win.__previewMock = true
  win.__previewCalls = []
  win.__previewFailures = {}
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const match = /\/api\/projects\/([^/]+)\/preview/.exec(url)
    if (!match) return original(input, init)
    const id = decodeURIComponent(match[1])
    const n = Number(id.slice(-2))
    win.__previewCalls!.push(id)
    await new Promise((resolve) => setTimeout(resolve, n === 1 ? 1500 : 150))
    if (n === 4) return new Response(JSON.stringify({ error: 'Project not found.' }), { status: 404 })
    if (n === 3) {
      const failures = (win.__previewFailures![id] = (win.__previewFailures![id] ?? 0) + 1)
      if (failures === 1) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
    }
    return new Response(JSON.stringify(mock(id, n)), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export function MockPreviewApi() {
  return null
}
