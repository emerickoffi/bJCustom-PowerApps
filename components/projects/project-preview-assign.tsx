'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormPanel, useFormOverlay, type FormPanelHandle } from '@/components/shared/form-overlay'
import { AssignTabs } from '@/components/projects/people-assign-workspace'
import { PanelViewHeader } from '@/components/projects/project-preview-subcontractors'
import { PreviewRequestError, fetchPreviewJson } from '@/components/shared/preview-request'
import type { AssignmentDirectory } from '@/lib/project-preview-data'
import { assignmentDirectoryApiPath, assignmentDirectoryErrorState } from '@/lib/project-preview'

type Target = { id: string; name: string; project_number: string }

function AssignHeader({ project }: { project: Target }) {
  const form = useFormOverlay()
  return (
    <PanelViewHeader
      title="Assign subcontractor"
      onBack={() => form?.requestClose()}
      description={
        <p className="break-words text-xs text-muted-foreground">
          {'Assigning to '}
          <span className="font-medium text-foreground">{project.name}</span>
          <span className="font-mono">{` · ${project.project_number}`}</span>
        </p>
      }
    />
  )
}

/**
 * The existing assignment workflow as a view inside the preview. The target is the previewed project passed in
 * here, never a selection made elsewhere, and its directory is loaded fresh each time the view opens.
 */
export function AssignView({
  project,
  handleRef,
  onDone,
  className,
}: {
  project: Target
  handleRef: React.Ref<FormPanelHandle>
  /** Leaving is allowed: nothing unsaved, a confirmed discard, or a saved assignment. */
  onDone: () => void
  className?: string
}) {
  const [opened] = useState(() => Date.now())
  const { data, error, isValidating, mutate } = useSWR<AssignmentDirectory>(
    [assignmentDirectoryApiPath(project.id), opened],
    ([url]: [string, number]) => fetchPreviewJson<AssignmentDirectory>(url),
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false },
  )
  // A directory is only ever used for the project it was loaded for.
  const directory = data?.projectId === project.id ? data : null
  const failure =
    error && !directory
      ? error instanceof PreviewRequestError
        ? assignmentDirectoryErrorState(error.status, error.reason)
        : assignmentDirectoryErrorState(null)
      : null

  return (
    <FormPanel
      onClose={onDone}
      handleRef={handleRef}
      header={<AssignHeader project={project} />}
      discardQuestion="Discard them and leave this assignment?"
      className={className}
    >
      {failure ? (
        <div role="alert" className="flex flex-col items-start gap-3 px-4 py-4">
          <p className="flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {failure.message}
          </p>
          {failure.retry && (
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11" disabled={isValidating} onClick={() => mutate()}>
              {isValidating ? (
                <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {isValidating ? 'Loading' : 'Try again'}
            </Button>
          )}
        </div>
      ) : directory ? (
        <AssignTabs
          projectId={project.id}
          projectName={project.name}
          rows={directory.rows}
          audience="subcontractors"
          canCreateCompany={directory.canCreateCompany}
        />
      ) : (
        <div role="status" className="flex flex-col gap-3 px-4 py-4">
          <span className="sr-only">Loading your directory</span>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="h-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-hidden="true" />
          ))}
        </div>
      )}
    </FormPanel>
  )
}
