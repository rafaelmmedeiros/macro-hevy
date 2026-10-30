import type { SetRow } from './parse'

/** A set inside a workout. The workout-level columns live on the workout and the exercise. */
export type WorkoutSet = Omit<SetRow, 'date' | 'workoutDurationSeconds' | 'workout' | 'exercise'>

export interface WorkoutExercise {
  /** MacroFactor's exercise name. */
  name: string
  sets: WorkoutSet[]
}

export interface Workout {
  /** Calendar date, `YYYY-MM-DD`. */
  date: string
  /** `Program (Day)`, as exported. */
  name: string
  /** Position among the workouts with this name on this date, starting at 1. Part of the import key. */
  ordinal: number
  durationSeconds: number
  exercises: WorkoutExercise[]
}

/**
 * Groups set rows into workouts, in file order. A workout is a run of consecutive rows that share
 * date, duration and name. Exercises keep the order in which they first appear, and sets keep row
 * order, so an exercise that comes back later in the workout gets its sets appended.
 */
export function groupWorkouts(rows: SetRow[]): Workout[] {
  const workouts: Workout[] = []
  const ordinals = new Map<string, number>()
  let current: Workout | undefined

  for (const { date, workoutDurationSeconds, workout: name, exercise, ...set } of rows) {
    if (
      current?.date !== date ||
      current.durationSeconds !== workoutDurationSeconds ||
      current.name !== name
    ) {
      const key = JSON.stringify([date, name])
      const ordinal = (ordinals.get(key) ?? 0) + 1
      ordinals.set(key, ordinal)
      current = { date, name, ordinal, durationSeconds: workoutDurationSeconds, exercises: [] }
      workouts.push(current)
    }

    let entry = current.exercises.find((e) => e.name === exercise)
    if (!entry) {
      entry = { name: exercise, sets: [] }
      current.exercises.push(entry)
    }
    entry.sets.push(set)
  }

  return workouts
}
