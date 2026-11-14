export type PhotoSource = 'direct' | 'daily_log' | 'walkthrough' | 'issue' | 'client_update'

export const PHOTO_SOURCES: readonly PhotoSource[] = ['direct', 'daily_log', 'walkthrough', 'issue', 'client_update']

export const PHOTO_SOURCE_LABELS: Record<PhotoSource, string> = {
  direct: 'Project upload',
  daily_log: 'Daily log',
  walkthrough: 'Walkthrough',
  issue: 'Issue',
  client_update: 'Client update',
}

export const PROJECT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
export const PROJECT_PHOTO_MAX_BYTES = 15 * 1024 * 1024
export const PROJECT_PHOTO_PAGE_SIZE = 48
/** Per-source ceiling on rows read for one library view; noted in the UI when reached. */
export const PROJECT_PHOTO_SOURCE_CAP = 1000

export type PhotoView = 'grid' | 'list'
export type PhotoSort = 'newest' | 'oldest'

/** Where a photo is used. The first reference is the record that owns the file. */
export type PhotoReference = {
  source: PhotoSource
  label: string
  href: string | null
}

export type LibraryPhoto = {
  /** Stable key: source plus record id of the owning row. */
  key: string
  id: string
  source: PhotoSource
  storagePath: string
  url: string | null
  fileName: string
  caption: string | null
  /** Date the photo belongs to (log date, walkthrough date, published date) or upload date. */
  date: string
  location: string | null
  phase: string | null
  tags: string[]
  uploadedById: string | null
  uploadedByName: string | null
  references: PhotoReference[]
  /** Homeowner can see it through an existing, explicit sharing path. Never set for direct uploads. */
  sharedWithHomeowner: boolean
  editable: boolean
}

export type PhotoFilters = {
  q: string
  source: PhotoSource | null
  from: string | null
  to: string | null
  uploader: string | null
  location: string | null
  sort: PhotoSort
  view: PhotoView
  page: number
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function isPhotoSource(value: unknown): value is PhotoSource {
  return typeof value === 'string' && (PHOTO_SOURCES as readonly string[]).includes(value)
}

export function parsePhotoFilters(params: Record<string, string | string[] | undefined>): PhotoFilters {
  const source = one(params.source)
  const from = one(params.from)
  const to = one(params.to)
  const uploader = one(params.uploader)
  const page = Number.parseInt(one(params.page), 10)
  return {
    q: one(params.q).slice(0, 100),
    source: isPhotoSource(source) ? source : null,
    from: DATE.test(from) ? from : null,
    to: DATE.test(to) ? to : null,
    uploader: UUID.test(uploader) ? uploader : null,
    location: one(params.location).slice(0, 120) || null,
    sort: one(params.sort) === 'oldest' ? 'oldest' : 'newest',
    view: one(params.view) === 'list' ? 'list' : 'grid',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  }
}

/** Query string for the library, dropping defaults so URLs stay short. */
export function photoFilterQuery(filters: Partial<PhotoFilters>): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.source) params.set('source', filters.source)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.uploader) params.set('uploader', filters.uploader)
  if (filters.location) params.set('location', filters.location)
  if (filters.sort === 'oldest') params.set('sort', 'oldest')
  if (filters.view === 'list') params.set('view', 'list')
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function projectPhotosPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/photos`
}

export function projectPhotoStoragePath(projectId: string, fileName: string) {
  return `project-photos/${projectId}/${fileName}`
}

export function isProjectPhotoPath(projectId: string, path: string) {
  const prefix = `project-photos/${projectId}/`
  return path.startsWith(prefix) && path.length > prefix.length && !path.slice(prefix.length).includes('/') && !path.includes('..')
}

export function matchesPhotoFilters(photo: LibraryPhoto, filters: PhotoFilters): boolean {
  if (filters.source && !photo.references.some((r) => r.source === filters.source)) return false
  const day = photo.date.slice(0, 10)
  if (filters.from && day < filters.from) return false
  if (filters.to && day > filters.to) return false
  if (filters.uploader && photo.uploadedById !== filters.uploader) return false
  if (filters.location && photo.location !== filters.location) return false
  if (filters.q) {
    const needle = filters.q.toLowerCase()
    const haystack = [photo.caption, photo.fileName, photo.location, photo.phase, photo.uploadedByName, ...photo.tags, ...photo.references.map((r) => r.label)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

export function sortPhotos(photos: LibraryPhoto[], sort: PhotoSort): LibraryPhoto[] {
  const direction = sort === 'oldest' ? 1 : -1
  return [...photos].sort((a, b) => (a.date < b.date ? -direction : a.date > b.date ? direction : a.key.localeCompare(b.key)))
}

/**
 * Collapses rows that point at the same stored file into one photo. The owning record wins and the
 * other rows become extra references, so a reused photo shows once and its history stays visible.
 */
export function mergeByStoragePath(photos: LibraryPhoto[]): LibraryPhoto[] {
  const byPath = new Map<string, LibraryPhoto>()
  for (const photo of photos) {
    const existing = byPath.get(photo.storagePath)
    if (!existing) {
      byPath.set(photo.storagePath, { ...photo, references: [...photo.references] })
      continue
    }
    const ownerFirst = existing.source === 'client_update' && photo.source !== 'client_update'
    const owner = ownerFirst ? { ...photo, references: [...photo.references] } : existing
    const other = ownerFirst ? existing : photo
    for (const ref of other.references) {
      if (!owner.references.some((r) => r.source === ref.source && r.label === ref.label)) owner.references.push(ref)
    }
    owner.sharedWithHomeowner = owner.sharedWithHomeowner || other.sharedWithHomeowner
    owner.caption = owner.caption ?? other.caption
    owner.url = owner.url ?? other.url
    byPath.set(photo.storagePath, owner)
  }
  return [...byPath.values()]
}
