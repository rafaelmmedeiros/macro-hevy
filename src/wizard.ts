import type { Workout } from './pipeline/group'
import type { Issue } from './pipeline/issue'

/** A MacroFactor export after parsing and grouping, as the first step leaves it. */
export interface LoadedCsv {
  fileName: string
  workouts: Workout[]
  issues: Issue[]
}
