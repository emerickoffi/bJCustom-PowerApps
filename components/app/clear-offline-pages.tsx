'use client'

import { useEffect } from 'react'
import { clearOfflinePages } from '@/components/app/service-worker-register'

/** On the sign-in page nobody is signed in, so no saved page copies should stay on the device. */
export function ClearOfflinePages() {
  useEffect(() => {
    void clearOfflinePages()
  }, [])
  return null
}
