'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MARKER_TONE_CLASSES, type MarkerTone } from '@/lib/project-map-tones'

export type MapPin = { id: string; lat: number; lng: number; tone: MarkerTone; title: string }

const MAX_FIT_ZOOM = 15
const SINGLE_PIN_ZOOM = 14

function pinIcon(tone: MarkerTone, selected: boolean) {
  const size = selected ? 30 : 22
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="flex size-full items-center justify-center rounded-full ring-2 ring-white shadow-md ${MARKER_TONE_CLASSES[tone]} ${
      selected ? 'outline-2 outline-offset-2 outline-foreground' : ''
    }"><span class="size-2 rounded-full bg-white"></span></span>`,
  })
}

/**
 * Leaflet map of project pins. The map instance is created once and removed on unmount; pins are diffed into one
 * layer, and a selection change only swaps two icons and pans, so choosing a project never rebuilds the map.
 */
export default function ProjectMap({
  pins,
  selectedId,
  onSelect,
}: {
  pins: MapPin[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, { marker: L.Marker; pin: MapPin }>())
  const onSelectRef = useRef(onSelect)
  const selectedRef = useRef(selectedId)
  const fittedKey = useRef('')

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { zoomControl: true, scrollWheelZoom: true, attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance)
    layer.current = L.layerGroup().addTo(instance)
    map.current = instance
    const resize = new ResizeObserver(() => instance.invalidateSize())
    resize.observe(container.current)
    const tracked = markers.current
    return () => {
      resize.disconnect()
      instance.remove()
      map.current = null
      layer.current = null
      tracked.clear()
      fittedKey.current = ''
    }
  }, [])

  useEffect(() => {
    const instance = map.current
    const group = layer.current
    if (!instance || !group) return
    const next = new Set(pins.map((p) => p.id))
    for (const [id, entry] of markers.current) {
      if (!next.has(id)) {
        group.removeLayer(entry.marker)
        markers.current.delete(id)
      }
    }
    for (const pin of pins) {
      const existing = markers.current.get(pin.id)
      const selected = pin.id === selectedRef.current
      if (existing) {
        existing.marker.setLatLng([pin.lat, pin.lng])
        if (existing.pin.tone !== pin.tone) existing.marker.setIcon(pinIcon(pin.tone, selected))
        existing.pin = pin
        continue
      }
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon(pin.tone, selected),
        title: pin.title,
        alt: pin.title,
        keyboard: true,
        riseOnHover: true,
      })
      marker.on('click', () => onSelectRef.current(pin.id))
      marker.on('keypress', (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') onSelectRef.current(pin.id)
      })
      group.addLayer(marker)
      markers.current.set(pin.id, { marker, pin })
    }

    // Refit only when the set of pinned projects changes (a filter or page), never on selection.
    const key = pins.map((p) => p.id).sort().join(',')
    if (key === fittedKey.current || !pins.length) return
    fittedKey.current = key
    if (pins.length === 1) instance.setView([pins[0].lat, pins[0].lng], SINGLE_PIN_ZOOM)
    else
      instance.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: MAX_FIT_ZOOM,
      })
  }, [pins])

  useEffect(() => {
    const previous = selectedRef.current
    selectedRef.current = selectedId
    if (previous && previous !== selectedId) {
      const prev = markers.current.get(previous)
      prev?.marker.setIcon(pinIcon(prev.pin.tone, false)).setZIndexOffset(0)
    }
    const current = selectedId ? markers.current.get(selectedId) : null
    if (!current || !map.current) return
    current.marker.setIcon(pinIcon(current.pin.tone, true)).setZIndexOffset(1000)
    const instance = map.current
    const point = L.latLng(current.pin.lat, current.pin.lng)
    if (!instance.getBounds().pad(-0.15).contains(point)) instance.panTo(point, { animate: true })
  }, [selectedId])

  return <div ref={container} className="isolate size-full" role="region" aria-label="Project locations map" />
}
