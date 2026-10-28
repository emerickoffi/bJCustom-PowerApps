'use client'

import { useState } from 'react'
import { NativeSelect } from '@/components/shared/form-field'

export type LocationOption = { city: string; state: string }

export function LocationFilters({
  locations,
  defaultState,
  defaultCity,
}: {
  locations: LocationOption[]
  defaultState: string
  defaultCity: string
}) {
  const [state, setState] = useState(defaultState)
  const [city, setCity] = useState(defaultCity)

  const states = [...new Set(locations.map((l) => l.state).filter(Boolean))].sort()
  const cities = [
    ...new Set(locations.filter((l) => l.city && (!state || l.state === state)).map((l) => l.city)),
  ].sort((a, b) => a.localeCompare(b))

  return (
    <>
      <label htmlFor="state" className="sr-only">
        State
      </label>
      <NativeSelect
        id="state"
        name="state"
        value={state}
        onChange={(e) => {
          const next = e.target.value
          setState(next)
          if (city && !locations.some((l) => l.city === city && (!next || l.state === next))) setCity('')
        }}
        className="bg-card sm:w-36"
      >
        <option value="">All states</option>
        {states.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </NativeSelect>
      <label htmlFor="city" className="sr-only">
        City
      </label>
      <NativeSelect
        id="city"
        name="city"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="bg-card sm:w-44"
      >
        <option value="">All cities</option>
        {cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </NativeSelect>
    </>
  )
}
