'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { HardHat as HardHatIcon, Pencil as PencilIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { ActionState } from '@/lib/action-state'
import type { SubcontractorFormData } from '@/lib/subcontractor-form-data'
import { createSubcontractorAction, updateSubcontractorAction } from '@/app/actions/subcontractors'
import { FormOverlay } from '@/components/shared/form-overlay'
import { SubcontractorForm } from '@/components/subcontractors/subcontractor-form'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Add and Edit Subcontractor as a right-side drawer over whatever page opened it. It is an intercepted route,
 * so the page underneath keeps its filters, search, and scroll; Back closes it; and refreshing the URL opens
 * the full-page form instead.
 */
export function SubcontractorFormDrawer({ data }: { data: SubcontractorFormData }) {
  const router = useRouter()
  const company = data.company

  const close = useCallback(() => {
    // Return to the page underneath, then refetch it so the directory or profile shows the latest data.
    window.addEventListener('popstate', () => router.refresh(), { once: true })
    router.back()
  }, [router])

  const onSaved = useCallback(
    (result: ActionState) => {
      if (result.warning) {
        toast.warning(result.warning)
        return
      }
      const id = result.savedId
      toast.success(result.success ?? 'Subcontractor saved.', {
        action:
          !company && id && UUID_RE.test(id)
            ? { label: 'View', onClick: () => router.push(`/subcontractors/${id}`) }
            : undefined,
      })
    },
    [company, router],
  )

  return (
    <FormOverlay
      open
      onClose={close}
      variant="drawer"
      size="lg"
      icon={company ? PencilIcon : HardHatIcon}
      title={company ? `Edit ${company.company_name}` : 'Add subcontractor'}
      description={
        company
          ? 'Update company details, contact persons, and project assignments.'
          : 'Save a trade partner to your directory. Only company name and trade are required.'
      }
    >
      <SubcontractorForm
        action={company ? updateSubcontractorAction.bind(null, company.id) : createSubcontractorAction}
        cancelHref={company ? `/subcontractors/${company.id}` : '/subcontractors'}
        onSaved={onSaved}
        {...data}
      />
    </FormOverlay>
  )
}
