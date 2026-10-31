import Link from "next/link";
import {
  Activity,
  Bell,
  Calendar,
  ChevronDown,
  History,
  Mail,
  MapPin,
  Phone,
  StickyNote,
} from "lucide-react";
import { markNotificationReadAction } from "@/app/actions/walkthroughs";
import { ACTIVITY_TYPE_LABELS } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { DashboardSectionHeader } from "@/components/dashboard/dashboard-section-header";
import { ActivityFitList } from "@/components/dashboard/activity-fit-list";

type ActivityItem = {
  id: string;
  activity_type: string;
  summary: string;
  created_at: string;
  client_id: string;
  clients: { first_name: string; last_name: string } | null;
};

const ACTIVITY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  meeting: Calendar,
  site_visit: MapPin,
};

export type ProjectUpdate = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  projectName: string | null;
};

function UpdateRow({ update }: { update: ProjectUpdate }) {
  return (
    <>
      <span
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-champagne-soft text-champagne-foreground ring-4 ring-card"
        aria-hidden="true"
      >
        <Bell className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs">
          <span className="font-medium text-primary">
            {update.projectName ?? "Project update"}
          </span>
          <time dateTime={update.created_at} className="text-muted-foreground">
            {formatDateTime(update.created_at)}
          </time>
        </div>
        {update.link ? (
          <Link
            href={update.link}
            className="text-pretty text-sm leading-relaxed text-foreground hover:text-primary"
          >
            {update.title}
          </Link>
        ) : (
          <p className="text-pretty text-sm leading-relaxed text-foreground">
            {update.title}
          </p>
        )}
        {update.body && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {update.body}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await markNotificationReadAction(update.id);
          }}
        >
          <button
            type="submit"
            className="min-h-6 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Dismiss
            <span className="sr-only">{`: ${update.title}`}</span>
          </button>
        </form>
      </div>
    </>
  );
}

const VISIBLE_LIMIT = 5;

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = ACTIVITY_ICONS[item.activity_type] ?? Activity;
  return (
    <>
      <span
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-sage text-primary ring-4 ring-card"
        aria-hidden="true"
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs">
          <span className="font-medium text-primary">
            {ACTIVITY_TYPE_LABELS[item.activity_type] ?? item.activity_type}
          </span>
          <time dateTime={item.created_at} className="text-muted-foreground">
            {formatDateTime(item.created_at)}
          </time>
        </div>
        <p className="text-pretty text-sm leading-relaxed text-foreground">
          {item.summary}
        </p>
        {item.clients && (
          <Link
            href={`/clients/${item.client_id}`}
            className="w-fit text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {`${item.clients.first_name} ${item.clients.last_name}`}
          </Link>
        )}
      </div>
    </>
  );
}

export function RecentActivity({
  items,
  updates = [],
  defaultOpen = false,
  visibleLimit = VISIBLE_LIMIT,
  total,
  totalIsLowerBound = false,
  matchHeightTo,
}: {
  items: ActivityItem[];
  updates?: ProjectUpdate[];
  /** Render expanded on first paint (the Command Center right rail). */
  defaultOpen?: boolean;
  visibleLimit?: number;
  /** Exact number of accessible entries; defaults to the loaded count. */
  total?: number;
  totalIsLowerBound?: boolean;
  /** Element id whose bottom edge the list fits to when shown side by side. */
  matchHeightTo?: string;
}) {
  const entries = [
    ...items.map((item) => ({
      type: "activity" as const,
      at: item.created_at,
      item,
    })),
    ...updates.map((update) => ({
      type: "update" as const,
      at: update.created_at,
      update,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const fitEntries = entries.map((entry) =>
    entry.type === "update"
      ? { key: `u-${entry.update.id}`, node: <UpdateRow update={entry.update} /> }
      : { key: entry.item.id, node: <ActivityRow item={entry.item} /> },
  );

  return (
    <section aria-labelledby="activity-heading" className="surface">
      <details className="group/activity" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[inherit] p-5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:px-6 [&::-webkit-details-marker]:hidden">
          <DashboardSectionHeader
            id="activity-heading"
            title="Recent Activity"
            icon={History}
            description={
              entries.length === 0
                ? "No recent client activity or project updates"
                : `${entries.length} recent ${entries.length === 1 ? "entry" : "entries"} · latest ${formatDateTime(entries[0].at)}`
            }
          />
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
            <span className="group-open/activity:hidden">Show</span>
            <span className="hidden group-open/activity:inline">Hide</span>
            <ChevronDown
              className="size-4 transition-transform group-open/activity:rotate-180"
              aria-hidden="true"
            />
          </span>
        </summary>
        <div className="border-t px-5 pb-5 pt-5 md:px-6">
          {entries.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Client notes, calls, and project events will show here.
            </p>
          ) : (
            <ActivityFitList
              entries={fitEntries}
              total={Math.max(total ?? entries.length, entries.length)}
              totalIsLowerBound={totalIsLowerBound}
              visibleLimit={visibleLimit}
              anchorId={matchHeightTo}
            />
          )}
        </div>
      </details>
    </section>
  );
}
