import { Badge } from '@/components/ui/badge'
import { CLIENT_UPDATE_STATE_LABELS, clientUpdateState, type ClientUpdateRow } from '@/lib/client-updates'

export function ClientUpdateStateBadge({ update }: { update: Pick<ClientUpdateRow, 'status' | 'version' | 'published_version'> }) {
  const state = clientUpdateState(update)
  return (
    <Badge variant={state === 'published' ? 'default' : state === 'pending_changes' ? 'secondary' : 'outline'}>
      {CLIENT_UPDATE_STATE_LABELS[state]}
    </Badge>
  )
}
