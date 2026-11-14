import 'server-only'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireStaff, type StaffSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { signMediaPaths } from '@/lib/media'
import { isMissingTableError } from '@/lib/subcontractors'
import { formatDate } from '@/lib/format'
import type { FeatureMap } from '@/lib/feature-registry'
import {
  PROJECT_PHOTO_PAGE_SIZE,
  PROJECT_PHOTO_SOURCE_CAP,
  matchesPhotoFilters,
  mergeByStoragePath,
  sortPhotos,
  type LibraryPhoto,
  type PhotoFilters,
} from '@/lib/project-photos'

type Supabase = Awaited<ReturnType<typeof createClient>>
type One<T> = T | T[] | null

function first<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export type PhotoLibraryResult = {
  photos: LibraryPhoto[]
  total: number
  pageCount: number
  uploaders: { id: string; name: string }[]
  locations: string[]
  /** A source returned PROJECT_PHOTO_SOURCE_CAP rows, so older photos from it are not in this view. */
  truncated: boolean
  /** The project_photos table is missing, so direct uploads are unavailable. */
  directSetupRequired: boolean
}

export type PhotosProject = { id: string; name: string; archived_at: string | null }

/** The library needs internal access to the project and at least one photo source switched on. */
export function photoLibraryEnabled(features: FeatureMap) {
  return Boolean(features.project_photos || features.daily_logs || features.walkthroughs || features.client_updates)
}

export async function requirePhotosProject(projectId: string): Promise<{ session: StaffSession; project: PhotosProject; features: FeatureMap }> {
  const session = await requireStaff()
  if (!UUID.test(projectId)) notFound()
  const supabase = await createClient()
  const [{ data: project }, { data: canViewInternal }, features] = await Promise.all([
    supabase.from('projects').select('id, name, archived_at').eq('id', projectId).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: projectId }),
    getOrgFeatures(session.organizationId),
  ])
  if (!project || !canViewInternal || !photoLibraryEnabled(features)) notFound()
  return { session, project: project as PhotosProject, features }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

async function loadDirect(supabase: Supabase, projectId: string) {
  const { data, error } = await supabase
    .from('project_photos')
    .select('id, storage_path, file_name, caption, location, phase, tags, uploaded_by, created_at')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PROJECT_PHOTO_SOURCE_CAP)
  if (error) return { photos: [] as LibraryPhoto[], count: 0, setupRequired: isMissingTableError(error) }
  const photos = (data ?? []).map(
    (r): LibraryPhoto => ({
      key: `direct:${r.id}`,
      id: r.id,
      source: 'direct',
      storagePath: r.storage_path,
      url: null,
      fileName: r.file_name,
      caption: r.caption,
      date: r.created_at,
      location: r.location,
      phase: r.phase,
      tags: r.tags ?? [],
      uploadedById: r.uploaded_by,
      uploadedByName: null,
      references: [{ source: 'direct', label: 'Uploaded to Project Photos', href: null }],
      sharedWithHomeowner: false,
      editable: true,
    }),
  )
  return { photos, count: data?.length ?? 0, setupRequired: false }
}

async function loadDailyLogs(supabase: Supabase, projectId: string) {
  const { data } = await supabase
    .from('daily_log_photos')
    .select('id, storage_path, file_name, caption, uploaded_by, created_at, daily_log_id, daily_logs!inner(project_id, log_date)')
    .eq('daily_logs.project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(PROJECT_PHOTO_SOURCE_CAP)
  const photos = (data ?? []).map((r): LibraryPhoto => {
    const log = first(r.daily_logs as One<{ log_date: string }>)
    const day = log?.log_date ?? r.created_at.slice(0, 10)
    return {
      key: `daily_log:${r.id}`,
      id: r.id,
      source: 'daily_log',
      storagePath: r.storage_path,
      url: null,
      fileName: r.file_name,
      caption: r.caption,
      date: day,
      location: null,
      phase: null,
      tags: [],
      uploadedById: r.uploaded_by,
      uploadedByName: null,
      references: [{ source: 'daily_log', label: `Daily log — ${formatDate(day)}`, href: `${base(projectId)}/daily-logs/${r.daily_log_id}` }],
      sharedWithHomeowner: false,
      editable: false,
    }
  })
  return { photos, count: data?.length ?? 0 }
}

async function loadWalkthroughs(supabase: Supabase, projectId: string) {
  const { data } = await supabase
    .from('walkthrough_attachments')
    .select(
      'id, storage_path, file_name, uploaded_by, created_at, walkthrough_id, walkthroughs!inner(project_id, title, scheduled_date, status, conducted_by), walkthrough_items(category, label)',
    )
    .eq('walkthroughs.project_id', projectId)
    .eq('media_kind', 'photo')
    .order('created_at', { ascending: false })
    .limit(PROJECT_PHOTO_SOURCE_CAP)
  const photos = (data ?? []).map((r): LibraryPhoto => {
    const w = first(r.walkthroughs as One<{ title: string; scheduled_date: string | null; status: string; conducted_by: string | null }>)
    const item = first(r.walkthrough_items as One<{ category: string; label: string }>)
    return {
      key: `walkthrough:${r.id}`,
      id: r.id,
      source: 'walkthrough',
      storagePath: r.storage_path,
      url: null,
      fileName: r.file_name,
      caption: item?.label ?? null,
      date: r.created_at,
      location: item?.category ?? null,
      phase: null,
      tags: [],
      uploadedById: r.uploaded_by,
      uploadedByName: null,
      references: [{ source: 'walkthrough', label: `Walkthrough — ${w?.title ?? 'Untitled'}`, href: `${base(projectId)}/walkthroughs/${r.walkthrough_id}` }],
      // Mirrors can_view_media_path: homeowners see walkthrough media they ran or that was submitted.
      sharedWithHomeowner: Boolean(w && (w.conducted_by === 'homeowner' || w.status === 'submitted')),
      editable: false,
    }
  })
  return { photos, count: data?.length ?? 0 }
}

async function loadIssues(supabase: Supabase, projectId: string) {
  const { data } = await supabase
    .from('issue_attachments')
    .select('id, storage_path, file_name, attachment_kind, uploaded_by, created_at, issue_id, project_issues!inner(project_id, item_label, category, walkthrough_id)')
    .eq('project_issues.project_id', projectId)
    .eq('media_kind', 'photo')
    .order('created_at', { ascending: false })
    .limit(PROJECT_PHOTO_SOURCE_CAP)
  const photos = (data ?? []).map((r): LibraryPhoto => {
    const issue = first(r.project_issues as One<{ item_label: string; category: string; walkthrough_id: string | null }>)
    return {
      key: `issue:${r.id}`,
      id: r.id,
      source: 'issue',
      storagePath: r.storage_path,
      url: null,
      fileName: r.file_name,
      caption: r.attachment_kind === 'repair' ? 'Repair photo' : null,
      date: r.created_at,
      location: issue?.category ?? null,
      phase: null,
      tags: [],
      uploadedById: r.uploaded_by,
      uploadedByName: null,
      references: [{ source: 'issue', label: `Issue — ${issue?.item_label ?? 'Untitled'}`, href: `${base(projectId)}/issues/${r.issue_id}` }],
      // Mirrors can_view_media_path: walkthrough-linked issue media is already visible to the homeowner.
      sharedWithHomeowner: Boolean(issue?.walkthrough_id),
      editable: false,
    }
  })
  return { photos, count: data?.length ?? 0 }
}

async function loadClientUpdates(supabase: Supabase, projectId: string) {
  const { data } = await supabase
    .from('client_update_publication_photos')
    .select('id, storage_path, caption, created_at, client_update_publications!inner(client_update_id, title, published_at)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(PROJECT_PHOTO_SOURCE_CAP)
  const photos = (data ?? []).map((r): LibraryPhoto => {
    const pub = first(r.client_update_publications as One<{ client_update_id: string; title: string; published_at: string }>)
    return {
      key: `client_update:${r.id}`,
      id: r.id,
      source: 'client_update',
      storagePath: r.storage_path,
      // The publication route proves access before signing; used when the file is not signable directly.
      url: `/api/client-updates/photos/${r.id}`,
      fileName: r.storage_path.split('/').pop() ?? 'photo',
      caption: r.caption,
      date: pub?.published_at ?? r.created_at,
      location: null,
      phase: null,
      tags: [],
      uploadedById: null,
      uploadedByName: null,
      references: [
        {
          source: 'client_update',
          label: `Client update — ${pub?.title ?? 'Published update'}`,
          href: pub ? `${base(projectId)}/client-updates/${pub.client_update_id}` : null,
        },
      ],
      sharedWithHomeowner: true,
      editable: false,
    }
  })
  return { photos, count: data?.length ?? 0 }
}

export async function loadProjectPhotoLibrary(
  projectId: string,
  features: Pick<FeatureMap, 'project_photos' | 'daily_logs' | 'walkthroughs' | 'client_updates'>,
  filters: PhotoFilters,
): Promise<PhotoLibraryResult> {
  const supabase = await createClient()
  const empty = { photos: [] as LibraryPhoto[], count: 0 }
  const [direct, dailyLogs, walkthroughs, issues, clientUpdates] = await Promise.all([
    features.project_photos ? loadDirect(supabase, projectId) : Promise.resolve({ ...empty, setupRequired: false }),
    features.daily_logs ? loadDailyLogs(supabase, projectId) : Promise.resolve(empty),
    features.walkthroughs ? loadWalkthroughs(supabase, projectId) : Promise.resolve(empty),
    features.walkthroughs ? loadIssues(supabase, projectId) : Promise.resolve(empty),
    features.client_updates ? loadClientUpdates(supabase, projectId) : Promise.resolve(empty),
  ])
  const sources = [direct, dailyLogs, walkthroughs, issues, clientUpdates]
  const truncated = sources.some((s) => s.count >= PROJECT_PHOTO_SOURCE_CAP)

  const all = mergeByStoragePath(sources.flatMap((s) => s.photos))

  const uploaderIds = [...new Set(all.map((p) => p.uploadedById).filter((id): id is string => Boolean(id)))]
  const names = new Map<string, string>()
  if (uploaderIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', uploaderIds)
    for (const p of profiles ?? []) names.set(p.id, p.full_name || p.email || 'Team member')
  }
  for (const photo of all) photo.uploadedByName = photo.uploadedById ? (names.get(photo.uploadedById) ?? null) : null

  const matching = sortPhotos(all.filter((p) => matchesPhotoFilters(p, filters)), filters.sort)
  const pageCount = Math.max(1, Math.ceil(matching.length / PROJECT_PHOTO_PAGE_SIZE))
  const page = Math.min(filters.page, pageCount)
  const visible = matching.slice((page - 1) * PROJECT_PHOTO_PAGE_SIZE, page * PROJECT_PHOTO_PAGE_SIZE)

  // Only the visible page is signed; storage RLS decides which paths this user may read.
  const signed = await signMediaPaths(visible.map((p) => p.storagePath))
  for (const photo of visible) photo.url = signed.get(photo.storagePath) ?? photo.url

  return {
    photos: visible,
    total: matching.length,
    pageCount,
    uploaders: uploaderIds.map((id) => ({ id, name: names.get(id) ?? 'Team member' })).sort((a, b) => a.name.localeCompare(b.name)),
    locations: [...new Set(all.map((p) => p.location).filter((l): l is string => Boolean(l)))].sort(),
    truncated,
    directSetupRequired: direct.setupRequired,
  }
}
