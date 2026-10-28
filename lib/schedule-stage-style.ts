import {
  BrickWall,
  Cable,
  ClipboardList,
  Hammer,
  KeyRound,
  Layers,
  PaintRoller,
  Shovel,
  Sofa,
  Trees,
  type LucideIcon,
} from 'lucide-react'

export type StageStyle = { background: string; accent: string; icon: LucideIcon }

const FALLBACK: StageStyle = { background: '#E9F1EA', accent: '#174D32', icon: Layers }

// Keyed by the normalized phase label stored on schedule activities (e.g. "Site work", "Rough-ins").
const STAGE_STYLES: Record<string, StageStyle> = {
  preconstruction: { background: '#FFF5DF', accent: '#B98212', icon: ClipboardList },
  site_work: { background: '#E8F5F1', accent: '#317B78', icon: Shovel },
  foundation: { background: '#EFF1FA', accent: '#6376AA', icon: BrickWall },
  structure: { background: '#EAF2FD', accent: '#3168A8', icon: Hammer },
  framing: { background: '#EAF2FD', accent: '#3168A8', icon: Hammer },
  rough_ins: { background: '#F4EEFA', accent: '#805AA0', icon: Cable },
  interior: { background: '#F8F0E6', accent: '#A46F43', icon: Sofa },
  finishes: { background: '#FAEDF2', accent: '#98677A', icon: PaintRoller },
  exterior: { background: '#ECF5EC', accent: '#497B55', icon: Trees },
  closeout: { background: '#E8F1E9', accent: '#174D32', icon: KeyRound },
}

export function stageStyle(phase: string): StageStyle {
  const key = phase
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return STAGE_STYLES[key] ?? FALLBACK
}
