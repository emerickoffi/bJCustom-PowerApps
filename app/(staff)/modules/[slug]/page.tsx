import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Hammer, Blocks as BlocksIcon } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { GRADUATED_MODULE_ROUTES, PLANNED_MODULES } from '@/lib/navigation'
import { PageHeader, EmptyState } from '@/components/shared/page-header'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: PLANNED_MODULES.find((m) => m.slug === slug)?.label ?? 'Module' }
}

export default async function PlannedModulePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireStaff()
  const { slug } = await params
  const graduated = GRADUATED_MODULE_ROUTES[slug]
  if (graduated) redirect(graduated)
  const mod = PLANNED_MODULES.find((m) => m.slug === slug)
  if (!mod) notFound()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={BlocksIcon} eyebrow={`Stage ${mod.stage}`} title={mod.label} description={mod.summary} />
      <EmptyState
        icon={Hammer}
        title={`${mod.label} arrives in stage ${mod.stage}`}
        description="This module builds on the clients and projects you are setting up now, so everything you enter today carries forward."
      />
    </div>
  )
}
