import type { HevyWorkout } from '../hevy/types'
import type { Workout } from './group'
import { findImportKey, importKey } from './marker'
import type { Resolution } from './resolve'

export type WorkoutStatus =
  /** Its marker is already in Hevy, so it is skipped. */
  | { kind: 'imported'; existing: HevyWorkout }
  /**
   * Unmarked Hevy workouts on the same date share exercises with it, so it was probably logged by
   * hand. `others` are the unmarked workouts on that date that share none.
   */
  | { kind: 'conflict'; conflicts: HevyWorkout[]; others: HevyWorkout[] }
  /** Nothing in Hevy matches. `others` are unmarked workouts on that date, for information. */
  | { kind: 'new'; others: HevyWorkout[] }

export interface WorkoutDiff {
  workout: Workout
  key: string
  status: WorkoutStatus
}

/**
 * Compares the workouts to import with the ones already in Hevy. Markers identify earlier imports.
 * An unmarked Hevy workout on the same date is a conflict only if it shares an exercise template
 * with the workout; a separate cardio session that day is just listed. Dates of Hevy workouts are
 * read in `timeZone`, the browser's, because the CSV dates are local calendar dates.
 */
export function diffWorkouts(
  workouts: readonly Workout[],
  resolutions: ReadonlyMap<string, Resolution>,
  existing: readonly HevyWorkout[],
  timeZone: string,
): WorkoutDiff[] {
  const toLocalDate = localDateFormatter(timeZone)
  const byKey = new Map<string, HevyWorkout>()
  const unmarkedByDate = new Map<string, HevyWorkout[]>()

  for (const hevyWorkout of existing) {
    const key = findImportKey(hevyWorkout.description)
    if (key !== null) {
      if (!byKey.has(key)) byKey.set(key, hevyWorkout)
      continue
    }
    const date = toLocalDate(hevyWorkout.start_time)
    unmarkedByDate.set(date, [...(unmarkedByDate.get(date) ?? []), hevyWorkout])
  }

  return workouts.map((workout) => {
    const key = importKey(workout)
    const imported = byKey.get(key)
    if (imported) return { workout, key, status: { kind: 'imported', existing: imported } }

    const templateIds = new Set<string>()
    for (const exercise of workout.exercises) {
      const resolution = resolutions.get(exercise.name)
      if (resolution?.status === 'resolved') templateIds.add(resolution.template.id)
    }

    const sameDay = unmarkedByDate.get(workout.date) ?? []
    const sharesExercises = (w: HevyWorkout) => w.exercises.some((e) => templateIds.has(e.exercise_template_id))
    const conflicts = sameDay.filter(sharesExercises)
    const others = sameDay.filter((w) => !sharesExercises(w))
    const status: WorkoutStatus =
      conflicts.length > 0 ? { kind: 'conflict', conflicts, others } : { kind: 'new', others }
    return { workout, key, status }
  })
}

/** Formats an ISO timestamp as the `YYYY-MM-DD` calendar date in `timeZone`. */
export function localDateFormatter(timeZone: string): (iso: string) => string {
  const format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return (iso) => {
    const parts = Object.fromEntries(format.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }
}
