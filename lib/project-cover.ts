export const COVER_KINDS = ['architectural_rendering', '3d_visualization', 'construction_photo', 'completed_home_photo'] as const
export type CoverKind = (typeof COVER_KINDS)[number]

export const COVER_KIND_LABELS: Record<CoverKind, string> = {
  architectural_rendering: 'Architectural rendering',
  '3d_visualization': '3D visualization',
  construction_photo: 'Construction photo',
  completed_home_photo: 'Completed home photo',
}

export const COVER_MAX_BYTES = 10 * 1024 * 1024
export const COVER_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const COVER_ACCEPT = Object.keys(COVER_MIME_EXTENSIONS).join(',')

/** `site_photo` is the automatic fallback: the latest walkthrough photo when no cover was chosen. */
export type ProjectCover = { url: string; kind: CoverKind | 'site_photo' | null }

export function isCoverKind(value: unknown): value is CoverKind {
  return typeof value === 'string' && (COVER_KINDS as readonly string[]).includes(value)
}

export function coverPathForOrg(orgId: string, mimeType: string): string | null {
  const ext = COVER_MIME_EXTENSIONS[mimeType]
  return ext ? `covers/${orgId}/${crypto.randomUUID()}.${ext}` : null
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export function isCoverPathForOrg(path: string, orgId: string): boolean {
  return new RegExp(`^covers/${orgId}/${UUID}\\.(jpg|png|webp)$`, 'i').test(path)
}

/** Renderings represent a planned design, so the alt text never implies the home is built. */
export function coverAlt(kind: ProjectCover['kind'] | undefined, projectName: string): string {
  switch (kind) {
    case 'architectural_rendering':
      return `Architectural rendering of ${projectName}`
    case '3d_visualization':
      return `3D visualization of ${projectName}`
    case 'completed_home_photo':
      return `Photo of the completed ${projectName}`
    case 'construction_photo':
      return `Construction photo of ${projectName}`
    default:
      return `Site photo for ${projectName}`
  }
}

/** Small badge shown only for imagery that depicts a planned design rather than the real site. */
export function coverDesignBadge(kind: ProjectCover['kind'] | undefined): string | null {
  return kind === 'architectural_rendering' || kind === '3d_visualization' ? COVER_KIND_LABELS[kind] : null
}

export function validateCoverFile(file: File): string | null {
  if (!COVER_MIME_EXTENSIONS[file.type]) return 'Choose a JPG, PNG, or WebP image.'
  if (file.size > COVER_MAX_BYTES) return 'Images must be 10 MB or smaller.'
  return null
}
