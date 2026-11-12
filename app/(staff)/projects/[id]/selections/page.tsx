import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { getProjectSelections, getSelectionCategories, getSelectionThumbnails } from '@/lib/selections-data'
import { SelectionsWorkspace } from '@/components/selections/selections-workspace'

export const metadata: Metadata = { title: 'Selections' }

export default async function SelectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'estimates')
  const { id } = await params
  const supabase = await createClient()
  const [{ data: project }, { rows, error }, categories] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).maybeSingle(),
    getProjectSelections(id),
    getSelectionCategories(),
  ])
  if (!project) notFound()

  const thumbnails = await getSelectionThumbnails(rows, new Map(rows.map((r) => [r.id, r.selected_option_id ?? null])))

  return <SelectionsWorkspace projectId={id} projectName={project.name} rows={rows} loadError={Boolean(error)} categories={categories} thumbnails={thumbnails} />
}
