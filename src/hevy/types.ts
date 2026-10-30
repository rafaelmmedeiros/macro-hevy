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
