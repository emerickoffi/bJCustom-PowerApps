import { CalendarSearch, ShieldAlert } from 'lucide-react'

export function ScheduleSelectionState({ unavailable, hasProjects }: { unavailable: boolean; hasProjects: boolean }) {
  const Icon = unavailable ? ShieldAlert : CalendarSearch
  const title = unavailable
    ? 'That project isn’t available'
    : hasProjects
      ? 'Select a project to view its schedule'
      : 'No projects yet'
  const description = unavailable
    ? 'The project in this link may have been archived, deleted, or isn’t part of your organization. Choose a project from the selector above to continue.'
    : hasProjects
      ? 'Use the project selector above to load that project’s activities, stages, and progress. You can also choose “All projects” for an overview.'
      : 'Create a project to start building its construction schedule.'

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center"
    >
      <span
        className={
          unavailable
            ? 'flex size-12 items-center justify-center rounded-full bg-[#FFF2DA] text-[#96570E]'
            : 'flex size-12 items-center justify-center rounded-full bg-[#174D32]/10 text-[#174D32]'
        }
        aria-hidden="true"
      >
        <Icon className="size-6" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="font-serif text-xl font-semibold text-foreground text-balance">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
      </div>
    </section>
  )
}
