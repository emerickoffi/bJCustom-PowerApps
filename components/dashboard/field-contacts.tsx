'use client'

import { Mail, Phone, Users } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { formatPhone } from '@/lib/format'
import type { JobContact } from '@/lib/field-dashboard-data'

export function FieldContactsButton({ contacts, jobName, className }: { contacts: JobContact[]; jobName: string; className: string }) {
  return (
    <Sheet>
      <SheetTrigger className={className}>
        <Users className="size-6" aria-hidden="true" />
        <span>Contacts</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>Job contacts</SheetTitle>
          <SheetDescription>{jobName}</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          {contacts.map((c) => (
            <li key={`${c.role}:${c.name}`} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                <span className="text-sm text-muted-foreground">{c.role}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.phone && (
                  <a
                    href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
                    className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Call ${c.name}, ${c.role}, at ${formatPhone(c.phone)}`}
                  >
                    <Phone className="size-4" aria-hidden="true" />
                    {formatPhone(c.phone)}
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Email ${c.name}, ${c.role}`}
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    Email
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
