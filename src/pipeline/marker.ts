import type { Workout } from './group'

// The marker line in an imported workout's description, for example
// `Imported from MacroFactor · 2026-10-19 · 5f1b9e2c · 1`. Workouts already in Hevy are recognized
// by it, so its format must never change once workouts have been imported with it.
const PREFIX = 'Imported from MacroFactor'
const SEPARATOR = ' · '
const MARKER = /Imported from MacroFactor\s*·\s*(\d{4}-\d{2}-\d{2})\s*·\s*([0-9a-f]{8})\s*·\s*(\d+)/

/**
 * The stable identity of an imported workout: its date, a hash of its name, and its ordinal among
 * workouts with that name on that date. Set content is left out on purpose, so editing a workout
 * in MacroFactor doesn't make it look new.
 */
export function importKey(workout: Pick<Workout, 'date' | 'name' | 'ordinal'>): string {
  return [workout.date, fnv1a(workout.name), String(workout.ordinal)].join(SEPARATOR)
}

export function markerLine(key: string): string {
  return PREFIX + SEPARATOR + key
}

/** The import key in a Hevy workout description, or null when it has no marker. */
export function findImportKey(description: string | null | undefined): string | null {
  const match = MARKER.exec(description ?? '')
  return match ? [match[1], match[2], String(Number(match[3]))].join(SEPARATOR) : null
}

/** 32-bit FNV-1a over the UTF-8 bytes, as 8 hex digits. Short, stable, and needs no async crypto. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
