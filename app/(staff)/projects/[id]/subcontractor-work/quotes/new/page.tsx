import { redirect } from 'next/navigation'

// Kept so existing links work: the list page opens its canonical creation drawer for `?new=1`
// and immediately drops the parameter, so it never lands in history or tab memory.
export default async function NewQuoteRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/subcontractor-work/quotes?new=1`)
}
