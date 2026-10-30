import type { HevyExerciseTemplate } from '../hevy/types'
import type { Issue } from './issue'

/** A curated entry: the Hevy built-in template for one MacroFactor exercise. */
export interface MappingEntry {
  id: string
  /** The template's title in Hevy, so reviewers can read the mapping and drift can be spotted. */
  title: string
  /**
   * A custom template title to prefer over the built-in. Used when the account has a custom
   * template with exactly this title, since custom IDs differ in every account.
   */
  customTitle?: string
}

/** MacroFactor exercise name → Hevy built-in template. */
export type ExerciseMapping = Readonly<Record<string, MappingEntry>>

export type Resolution =
  | {
      status: 'resolved'
      /** `choice`: picked by the user. `mapping`: curated mapping. `custom`: custom template with the same title. */
      source: 'choice' | 'mapping' | 'custom'
      template: HevyExerciseTemplate
    }
  | { status: 'unresolved' }

export interface ResolveResult {
  /** One entry per exercise name, in the order given. */
  resolutions: Map<string, Resolution>
  issues: Issue[]
}

/**
 * Finds the Hevy template for each MacroFactor exercise. In order: the user's pick, the curated
 * mapping (its preferred custom template when the account has one, otherwise its built-in), then a
 * custom template whose title is exactly the MacroFactor name. Only templates the account actually
 * has are used, so a mapping entry whose ID is missing is reported and skipped.
 */
export function resolveExercises(
  names: readonly string[],
  templates: readonly HevyExerciseTemplate[],
  mapping: ExerciseMapping,
  choices: ReadonlyMap<string, string> = new Map(),
): ResolveResult {
  const byId = new Map(templates.map((t) => [t.id, t]))
  const customByTitle = new Map(templates.filter((t) => t.is_custom).map((t) => [t.title, t]))
  const resolutions = new Map<string, Resolution>()
  const issues: Issue[] = []

  for (const name of names) {
    const chosen = byId.get(choices.get(name) ?? '')
    if (chosen) {
      resolutions.set(name, { status: 'resolved', source: 'choice', template: chosen })
      continue
    }

    const entry = Object.hasOwn(mapping, name) ? mapping[name] : undefined
    if (entry) {
      const preferred = entry.customTitle === undefined ? undefined : customByTitle.get(entry.customTitle)
      if (preferred) {
        resolutions.set(name, { status: 'resolved', source: 'mapping', template: preferred })
        continue
      }
      const mapped = byId.get(entry.id)
      if (mapped) {
        if (mapped.title !== entry.title) {
          issues.push({
            severity: 'warning',
            message: `"${name}" is mapped to "${entry.title}", but this account calls template ${entry.id} "${mapped.title}". Check that it's the right exercise.`,
          })
        }
        resolutions.set(name, { status: 'resolved', source: 'mapping', template: mapped })
        continue
      }
      issues.push({
        severity: 'warning',
        message: `"${name}" is mapped to the Hevy template ${entry.id} ("${entry.title}"), which this account doesn't have.`,
      })
    }

    const custom = customByTitle.get(name)
    resolutions.set(name, custom ? { status: 'resolved', source: 'custom', template: custom } : { status: 'unresolved' })
  }

  return { resolutions, issues }
}
