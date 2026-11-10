'use client'

import { useState } from 'react'
import { NativeSelect } from '@/components/shared/form-field'

export type LocationOption = { city: string; state: string }
export type LocationValue = { state: string; city: string }

/** The State and City pair: cities narrow to the chosen state, and a city outside the new state is cleared. */
export function LocationSelects({
  locations,
  value,
  onChange,
  named = true,
  fieldClassName = 'contents',
  labelClassName = 'sr-only',
  stateClassName = 'bg-card sm:w-36',
  cityClassName = 'bg-card sm:w-44',
}: {
  locations: LocationOption[]
  value: LocationValue
  onChange: (next: LocationValue) => void
  /** Submit the selects with their form. Off when the owner submits the values itself. */
  named?: boolean
  fieldClassName?: string
  labelClassName?: string
  stateClassName?: string
  cityClassName?: string
}) {
  const { state, city } = value
  const states = [...new Set(locations.map((l) => l.state).filter(Boolean))].sort()
  const cities = [
    ...new Set(locations.filter((l) => l.city && (!state || l.state === state)).map((l) => l.city)),
  ].sort((a, b) => a.localeCompare(b))

  return (
    <>
      <div className={fieldClassName}>
        <label htmlFor="state" className={labelClassName}>
          State
        </label>
        <NativeSelect
          id="state"
          name={named ? 'state' : undefined}
          value={state}
          onChange={(e) => {
            const next = e.target.value
            const cityStillValid = !city || locations.some((l) => l.city === city && (!next || l.state === next))
            onChange({ state: next, city: cityStillValid ? city : '' })
          }}
          className={stateClassName}
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className={fieldClassName}>
        <label htmlFor="city" className={labelClassName}>
          City
        </label>
        <NativeSelect
          id="city"
          name={named ? 'city' : undefined}
          value={city}
          onChange={(e) => onChange({ state, city: e.target.value })}
          className={cityClassName}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </div>
    </>
  )
}

export function LocationFilters({
  locations,
  defaultState,
  defaultCity,
}: {
  locations: LocationOption[]
  defaultState: string
  defaultCity: string
}) {
  const [value, setValue] = useState<LocationValue>({ state: defaultState, city: defaultCity })
  return <LocationSelects locations={locations} value={value} onChange={setValue} />
}
