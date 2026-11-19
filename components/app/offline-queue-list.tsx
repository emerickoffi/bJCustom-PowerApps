'use client'

import { useEffect, useState } from 'react'
import { CloudUpload } from 'lucide-react'
import { lastOutboxIdentity } from '@/lib/field-outbox'
import { statusText } from '@/lib/field-outbox-shared'
import { useOutboxItems } from '@/components/app/field-outbox'

/** On the offline page there is no session: show the queue of whoever last used Trefort on this device. */
export function OfflineQueueList() {
  const [identity, setIdentity] = useState<{ userId: string; orgId: string } | null>(null)
  useEffect(() => setIdentity(lastOutboxIdentity()), [])
  const items = useOutboxItems(identity)
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Saved on this phone, waiting to upload</p>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 px-3 py-2 text-sm">
            <CloudUpload className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{item.label}</span>
              <span className="text-xs text-muted-foreground">{statusText(item)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
