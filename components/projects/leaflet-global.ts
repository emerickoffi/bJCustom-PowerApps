import L from 'leaflet'

// leaflet.markercluster attaches itself to a global `L`. Importing this module just before the plugin gives it one.
if (typeof window !== 'undefined') (window as unknown as { L: typeof L }).L = L
