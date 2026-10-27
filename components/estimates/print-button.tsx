'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return (
    <Button size="lg" onClick={() => window.print()}>
      <Printer data-icon="inline-start" />
      Print or save as PDF
    </Button>
  )
}
