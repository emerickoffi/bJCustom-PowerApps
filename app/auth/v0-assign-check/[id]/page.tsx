import { parseLayoutPreference } from '@/lib/ui-layout'
import { AssignFixture } from './fixture'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const [{ id }, q] = await Promise.all([params, searchParams])
  return (
    <AssignFixture
      initialProject={id === 'p2' ? 'p2' : 'p1'}
      layout={parseLayoutPreference(q.layout)}
      initialPeople={q.people === 'assigned' ? 'assigned' : 'empty'}
      camera={q.camera === '1'}
      assistant={q.ai !== '0'}
      assignable={q.assign !== '0'}
    />
  )
}
