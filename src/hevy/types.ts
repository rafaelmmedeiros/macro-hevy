/** The account behind an API key, from `GET /v1/user/info`. */
export interface HevyUser {
  id: string
  username: string
  name: string
  url: string
  weight_unit: 'kg' | 'lbs'
  distance_unit: 'kilometers' | 'miles'
  is_pro: boolean
}

/** An exercise template as `GET /v1/exercise_templates` returns it. */
export interface HevyExerciseTemplate {
  /** 8-character code for built-in templates, UUID for custom ones. */
  id: string
  title: string
  /** For example `weight_reps` or `duration`. `POST` uses different names for some types. */
  type: string
  primary_muscle_group: string
  secondary_muscle_groups: string[]
  equipment: string
  is_custom: boolean
  thumbnail_url?: string | null
}

/** A workout as `GET /v1/workouts` returns it, limited to the fields this tool reads. */
export interface HevyWorkout {
  id: string
  title: string
  description: string | null
  /** ISO 8601 in UTC, for example `2026-10-19T22:35:07+00:00`. */
  start_time: string
  end_time: string
  /** When it was saved to Hevy. `GET /v1/workouts` sorts by this, not by `start_time`. */
  created_at: string
  exercises: { title: string; exercise_template_id: string }[]
}

/** The `workout` object in the body of `POST /v1/workouts`. */
export interface NewWorkout {
  title: string
  description: string | null
  /** ISO 8601, for example `2026-10-19T21:00:00Z`. */
  start_time: string
  end_time: string
  is_private: boolean
  exercises: NewWorkoutExercise[]
}

export interface NewWorkoutExercise {
  exercise_template_id: string
  superset_id: number | null
  notes: string | null
  sets: NewWorkoutSet[]
}

export interface NewWorkoutSet {
  type: 'warmup' | 'normal' | 'failure' | 'dropset'
  weight_kg: number | null
  reps: number | null
  /** Integer. */
  distance_meters: number | null
  /** Integer. */
  duration_seconds: number | null
  /** Steps or floors, for the templates that record them. */
  custom_metric: number | null
  /** Only 6, 7, 7.5, 8, 8.5, 9, 9.5 or 10. */
  rpe: number | null
}

export type MuscleGroup =
  | 'abdominals' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'quadriceps' | 'hamstrings'
  | 'calves' | 'glutes' | 'abductors' | 'adductors' | 'lats' | 'upper_back' | 'traps'
  | 'lower_back' | 'chest' | 'cardio' | 'neck' | 'full_body' | 'other'

/** The `exercise` object in the body of `POST /v1/exercise_templates`. */
export interface NewExerciseTemplate {
  title: string
  /** `CustomExerciseType` in the spec. Some names differ from the types `GET` returns. */
  exercise_type:
    | 'weight_reps' | 'reps_only' | 'bodyweight_reps' | 'bodyweight_assisted_reps' | 'duration'
    | 'weight_duration' | 'distance_duration' | 'short_distance_weight'
  equipment_category:
    | 'none' | 'barbell' | 'dumbbell' | 'kettlebell' | 'machine' | 'plate' | 'resistance_band'
    | 'suspension' | 'other'
  muscle_group: MuscleGroup
  other_muscles: MuscleGroup[]
}
