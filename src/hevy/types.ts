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
