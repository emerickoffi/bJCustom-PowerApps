import { Clock } from 'lucide-react'

/** Stays on the page after a submission, since the submit form (and its success message) is removed once the work is submitted. */
export function AwaitingBuilderNotice() {
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium">Submitted for inspection.</span> The builder reviews it next. Nothing more is needed from you until they
        respond. Their decision will appear here and in your work list.
      </span>
    </p>
  )
}
