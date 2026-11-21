'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import './leaflet-global'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { MARKER_TONE_CLASSES, type MarkerTone } from '@/lib/project-map-tones'

export type MapPin = {
  id: string
  lat: number
  lng: number
  tone: MarkerTone
  title: string
  /** Small cover photo; without one the pin is a colored dot. */
  thumbUrl?: string | null
}

const MAX_FIT_ZOOM = 15
const SINGLE_PIN_ZOOM = 14

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * A photo pin shows the house inside a ring in the status color, so the map reads by status at a glance and by
 * house up close. Without a photo, or if it fails to load, the pin is the colored dot it always was.
 */
function pinIcon(pin: MapPin, selected: boolean) {
  const outline = selected ? 'outline-2 outline-offset-2 outline-foreground' : ''
  if (pin.thumbUrl) {
    const size = selected ? 56 : 44
    return L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      // The white dot underneath shows through if the photo cannot load, so a failed photo looks like a normal pin.
      html: `<span class="relative flex size-full items-center justify-center rounded-full shadow-md ${MARKER_TONE_CLASSES[pin.tone]} ${outline}"><span class="size-2.5 rounded-full bg-white"></span><img src="${escapeAttr(
        pin.thumbUrl,
      )}" alt="" loading="lazy" decoding="async" draggable="false" class="absolute inset-[3px] size-[calc(100%-6px)] rounded-full border-2 border-white bg-white object-cover" onerror="this.remove()"></span>`,
    })
  }
  const size = selected ? 30 : 22
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="flex size-full items-center justify-center rounded-full ring-2 ring-white shadow-md ${MARKER_TONE_CLASSES[pin.tone]} ${outline}"><span class="size-2 rounded-full bg-white"></span></span>`,
  })
}

/** Nearby projects group into one bubble with a count; it opens as you zoom in or click it. */
function clusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 40 : count < 100 ? 46 : 52
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="flex size-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background shadow-md ring-4 ring-white/80" aria-label="${count} projects">${count}</span>`,
  })
}

/**
 * Leaflet map of project pins. The map instance is created once and removed on unmount; pins are diffed into one
 * cluster layer, and a selection change only swaps two icons and brings the pin into view, so choosing a project
 * never rebuilds the map.
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
  const layer = useRef<L.MarkerClusterGroup | null>(null)
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
    layer.current = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
      // Houses on the same street stay separate once you are looking at a neighborhood.
      disableClusteringAtZoom: 16,
    }).addTo(instance)
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
    const removed: L.Marker[] = []
    for (const [id, entry] of markers.current) {
      if (!next.has(id)) {
        removed.push(entry.marker)
        markers.current.delete(id)
      }
    }
    if (removed.length) group.removeLayers(removed)
    const added: L.Marker[] = []
    for (const pin of pins) {
      const existing = markers.current.get(pin.id)
      const selected = pin.id === selectedRef.current
      if (existing) {
        existing.marker.setLatLng([pin.lat, pin.lng])
        if (existing.pin.tone !== pin.tone || existing.pin.thumbUrl !== pin.thumbUrl) {
          existing.marker.setIcon(pinIcon(pin, selected))
        }
        existing.pin = pin
        continue
      }
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon(pin, selected),
        title: pin.title,
        alt: pin.title,
        keyboard: true,
        riseOnHover: true,
      })
      marker.on('click', () => onSelectRef.current(pin.id))
      marker.on('keypress', (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') onSelectRef.current(pin.id)
      })
      added.push(marker)
      markers.current.set(pin.id, { marker, pin })
    }
    if (added.length) group.addLayers(added)

    // Refit only when the set of pinned projects changes (a filter or page), never on selection.
    const key = pins.map((p) => p.id).sort().join(',')
    if (key === fittedKey.current || !pins.length) return
    fittedKey.current = key
    if (pins.length === 1) instance.setView([pins[0].lat, pins[0].lng], SINGLE_PIN_ZOOM)
    else
      instance.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [48, 48],
        maxZoom: MAX_FIT_ZOOM,
      })
  }, [pins])

  useEffect(() => {
    const previous = selectedRef.current
    selectedRef.current = selectedId
    if (previous && previous !== selectedId) {
      const prev = markers.current.get(previous)
      prev?.marker.setIcon(pinIcon(prev.pin, false)).setZIndexOffset(0)
    }
    const current = selectedId ? markers.current.get(selectedId) : null
    if (!current || !map.current || !layer.current) return
    current.marker.setIcon(pinIcon(current.pin, true)).setZIndexOffset(1000)
    const instance = map.current
    // If the project is inside a bubble, zoom just enough to show its own pin; otherwise pan only when needed.
    if (!layer.current.getVisibleParent(current.marker) || layer.current.getVisibleParent(current.marker) !== current.marker) {
      layer.current.zoomToShowLayer(current.marker)
      return
    }
    const point = L.latLng(current.pin.lat, current.pin.lng)
    if (!instance.getBounds().pad(-0.15).contains(point)) instance.panTo(point, { animate: true })
  }, [selectedId])

  return <div ref={container} className="isolate size-full" role="region" aria-label="Project locations map" />
}
