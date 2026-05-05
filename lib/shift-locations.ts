export type ShiftLocation = 'cafe' | 'kitchen_car' | 'event'

export const SHIFT_LOCATION_OPTIONS: ShiftLocation[] = ['cafe', 'kitchen_car', 'event']

type LocationMeta = {
  label: string
  emoji: string
  dot: string
  cell: string
  badge: string
  border: string
}

export const LOCATION_META: Record<ShiftLocation, LocationMeta> = {
  cafe: {
    label: 'カフェ',
    emoji: '☕',
    dot: 'bg-teal-500',
    cell: 'bg-teal-50',
    badge: 'bg-teal-50 text-teal-700 border border-teal-200',
    border: 'border-teal-300',
  },
  kitchen_car: {
    label: 'キッチンカー',
    emoji: '🚐',
    dot: 'bg-amber-400',
    cell: 'bg-amber-50',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    border: 'border-amber-300',
  },
  event: {
    label: 'イベント',
    emoji: '🎪',
    dot: 'bg-violet-400',
    cell: 'bg-violet-50',
    badge: 'bg-violet-50 text-violet-700 border border-violet-200',
    border: 'border-violet-300',
  },
}

export function locationOf(s: { location?: string | null } | null | undefined): ShiftLocation {
  const v = s?.location
  if (v === 'kitchen_car' || v === 'event') return v
  return 'cafe'
}

export function metaOf(s: { location?: string | null } | null | undefined): LocationMeta {
  return LOCATION_META[locationOf(s)]
}
