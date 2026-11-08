import { redirect } from 'next/navigation'

export default async function AddFromDirectoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${encodeURIComponent(id)}/contacts?add=1`)
}
