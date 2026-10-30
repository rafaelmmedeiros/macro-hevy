import type { NewWorkout, NewWorkoutSet } from '../hevy/types'
import type { Workout, WorkoutExercise, WorkoutSet } from './group'
import type { Issue } from './issue'
import { importKey, markerLine } from './marker'
import type { Resolution } from './resolve'

export interface PayloadOptions {
  /** When the workout started. It ends the workout's duration later. */
  startTime: Date
  isPrivate: boolean
}

export interface PayloadResult {
  /** Null when the workout can't be built yet, for example while an exercise is unresolved. */
  workout: NewWorkout | null
  issues: Issue[]
}

type SetField = 'weight' | 'reps' | 'distance' | 'duration'

const ALL_FIELDS: readonly SetField[] = ['weight', 'reps', 'distance', 'duration']

// The set fields each template type records. Keys are the types `GET /v1/exercise_templates`
// returns, plus `bodyweight_reps` and `weight_duration`, which only the `POST` spec names so far.
const TEMPLATE_FIELDS: Readonly<Record<string, readonly SetField[]>> = {
  weight_reps: ['weight', 'reps'],
  reps_only: ['reps'],
  bodyweight_reps: ['reps'],
  bodyweight_weighted: ['weight', 'reps'],
  bodyweight_assisted: ['weight', 'reps'],
  duration: ['duration'],
  weight_duration: ['weight', 'duration'],
  distance_duration: ['distance', 'duration'],
  short_distance_weight: ['distance', 'weight'],
  floors_duration: ['duration'],
  steps_duration: ['duration'],
}

const SET_TYPES: Readonly<Record<string, NewWorkoutSet['type']>> = {
  'Standard Set': 'normal',
  'Warm-Up Set': 'warmup',
}

const ALLOWED_RPE = new Set([6, 7, 7.5, 8, 8.5, 9, 9.5, 10])

const NAME_WITH_DAY = /^(.*?)\s*\(([^()]*)\)$/

/** `Program (Day)` → title `Day` and program `Program`. A name without a day is all title. */
export function splitWorkoutName(name: string): { title: string; program: string | null } {
  const match = NAME_WITH_DAY.exec(name)
  const day = match?.[2].trim()
  if (!match || !day) return { title: name, program: null }
  return { title: day, program: match[1].trim() || null }
}

/** Builds the `POST /v1/workouts` body for one workout. Every exercise must be resolved. */
export function buildWorkout(
  workout: Workout,
  resolutions: ReadonlyMap<string, Resolution>,
  options: PayloadOptions,
): PayloadResult {
  const issues: Issue[] = []
  const exercises: NewWorkout['exercises'] = []

  for (const exercise of workout.exercises) {
    const resolution = resolutions.get(exercise.name)
    if (resolution?.status !== 'resolved') {
      issues.push({ severity: 'error', message: `"${exercise.name}" isn't matched to a Hevy exercise yet.` })
      continue
    }

    const { template } = resolution
    const fields = Object.hasOwn(TEMPLATE_FIELDS, template.type) ? TEMPLATE_FIELDS[template.type] : undefined
    if (!fields) {
      issues.push({
        severity: 'warning',
        message: `"${template.title}" has the exercise type "${template.type}", which this tool doesn't know, so every value is sent.`,
      })
    }
    for (const field of droppedFields(exercise, fields ?? ALL_FIELDS)) {
      issues.push({
        severity: 'warning',
        message: `"${exercise.name}" goes to "${template.title}", which doesn't record ${field}, so its ${field} values are left out.`,
      })
    }

    exercises.push({
      exercise_template_id: template.id,
      superset_id: null,
      notes: `MacroFactor: ${exercise.name}`,
      sets: exercise.sets.map((set) => buildSet(set, fields ?? ALL_FIELDS)),
    })
  }

  issues.push(...setIssues(workout))
  if (issues.some((issue) => issue.severity === 'error')) return { workout: null, issues }

  const { title, program } = splitWorkoutName(workout.name)
  const marker = markerLine(importKey(workout))
  const start = options.startTime.getTime()
  return {
    workout: {
      title,
      description: program ? `${program}\n${marker}` : marker,
      start_time: isoSeconds(start),
      end_time: isoSeconds(start + workout.durationSeconds * 1000),
      is_private: options.isPrivate,
      exercises,
    },
    issues,
  }
}

function buildSet(set: WorkoutSet, fields: readonly SetField[]): NewWorkoutSet {
  const keep = (field: SetField, value: number | null) => (fields.includes(field) ? value : null)
  return {
    type: Object.hasOwn(SET_TYPES, set.setType) ? SET_TYPES[set.setType] : 'normal',
    weight_kg: keep('weight', totalWeightKg(set)),
    reps: keep('reps', set.reps),
    distance_meters: keep('distance', distanceMeters(set)),
    duration_seconds: keep('duration', set.durationSeconds === null ? null : Math.round(set.durationSeconds)),
    custom_metric: null,
    rpe: rpeFromRir(set.rir),
  }
}

/** Fields that have values in MacroFactor but that the target template doesn't record. */
function droppedFields(exercise: WorkoutExercise, fields: readonly SetField[]): SetField[] {
  const present = (field: SetField) =>
    exercise.sets.some((set) => {
      switch (field) {
        case 'weight': return totalWeightKg(set) !== null
        case 'reps': return set.reps !== null
        case 'distance': return distanceMeters(set) !== null
        case 'duration': return set.durationSeconds !== null
      }
    })
  return ALL_FIELDS.filter((field) => !fields.includes(field) && present(field))
}

/** Unknown set types, once per type, and sets that have both a short and a long distance. */
function setIssues(workout: Workout): Issue[] {
  const issues: Issue[] = []
  const unknownTypes = new Set<string>()
  for (const set of workout.exercises.flatMap((e) => e.sets)) {
    if (!Object.hasOwn(SET_TYPES, set.setType)) unknownTypes.add(set.setType)
    if (set.distanceShortMeters !== null && set.distanceLongMeters !== null) {
      issues.push({
        severity: 'warning',
        line: set.line,
        message: 'This set has both a short and a long distance. Only the short one is imported.',
      })
    }
  }
  for (const type of unknownTypes) {
    issues.push({ severity: 'warning', message: `The set type "${type}" isn't known, so those sets are imported as normal sets.` })
  }
  return issues
}

/** Hevy has no base weight, so the machine's or sled's own weight is added in. */
function totalWeightKg(set: WorkoutSet): number | null {
  if (set.weightKg === null && set.baseWeightKg === null) return null
  // Rounding clears floating-point noise and keeps pound conversions exact to a gram.
  return Math.round(((set.weightKg ?? 0) + (set.baseWeightKg ?? 0)) * 1000) / 1000
}

function distanceMeters(set: WorkoutSet): number | null {
  const meters = set.distanceShortMeters ?? set.distanceLongMeters
  return meters === null ? null : Math.round(meters)
}

/** RPE = 10 − RIR, but only when Hevy accepts the result. It is never rounded to a nearby value. */
function rpeFromRir(rir: number | null): number | null {
  if (rir === null) return null
  const rpe = 10 - rir
  return ALLOWED_RPE.has(rpe) ? rpe : null
}

function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
