import type { WorkoutDiff } from '../pipeline/diff'
import { describeError } from './account'
import { HevyError, type HevyClient } from './client'
import type { HevyWorkout, NewWorkout } from './types'

export type ImportOutcome =
  | { status: 'imported'; workout: HevyWorkout }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string }

export interface ImportItem {
  key: string
  workout: NewWorkout
}

export interface ImportPlan {
  /** Keys to import, in the order of the diffs. */
  keys: string[]
  /** Selected keys that won't be imported, with the reason. */
  skipped: Map<string, string>
}

/**
 * Decides what to import from diffs computed right before writing, so it reflects deletions and
 * earlier imports. A conflict is imported only if it already was one when the user chose it;
 * a workout that became a conflict in the meantime is held back for another look.
 */
export function planImport(
  freshDiffs: readonly WorkoutDiff[],
  selected: ReadonlySet<string>,
  acceptedConflicts: ReadonlySet<string>,
): ImportPlan {
  const keys: string[] = []
  const skipped = new Map<string, string>()
  for (const { key, status } of freshDiffs) {
    if (!selected.has(key)) continue
    if (status.kind === 'imported') skipped.set(key, 'It is already in Hevy.')
    else if (status.kind === 'conflict' && !acceptedConflicts.has(key)) {
      skipped.set(key, 'A similar workout showed up in Hevy on that date. Review it and try again.')
    } else keys.push(key)
  }
  return { keys, skipped }
}

/**
 * Creates the workouts one at a time, reporting each outcome as it happens. A rejected key or rate
 * limiting stops the run, since every later request would fail the same way, and the rest are
 * reported as skipped. Any other failure only affects its own workout.
 */
export async function importWorkouts(
  client: Pick<HevyClient, 'createWorkout'>,
  items: readonly ImportItem[],
  onoutcome: (key: string, outcome: ImportOutcome) => void,
): Promise<void> {
  let stopReason: string | null = null
  for (const item of items) {
    if (stopReason !== null) {
      onoutcome(item.key, { status: 'skipped', reason: stopReason })
      continue
    }
    try {
      onoutcome(item.key, { status: 'imported', workout: await client.createWorkout(item.workout) })
    } catch (error) {
      const message = describeError(error)
      onoutcome(item.key, { status: 'failed', error: message })
      if (error instanceof HevyError && (error.status === 401 || error.status === 429)) {
        stopReason = `Not attempted after an earlier error: ${message}`
      }
    }
  }
}
