import { redirect } from 'next/navigation'
import { selectionsPath } from '@/lib/selections'

/** Old bookmarks and links to the standalone form now open the drawer on the list page. */
export default async function NewSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`${selectionsPath(id)}?new=1`)
}
