import { describe, expect, it } from 'vitest'
import type { HevyExerciseTemplate } from '../hevy/types'
import { resolveExercises, type ExerciseMapping, type Resolution } from './resolve'

function template(id: string, title: string, isCustom = false): HevyExerciseTemplate {
  return {
    id,
    title,
    type: 'weight_reps',
    primary_muscle_group: 'chest',
    secondary_muscle_groups: [],
    equipment: 'machine',
    is_custom: isCustom,
  }
}

const BENCH = template('79D0BB3A', 'Bench Press (Barbell)')
const LEG_PRESS = template('C7973E0E', 'Leg Press (Machine)')
const CUSTOM_ROW = template('86025ce4-ee43-47be-9496-33c4ea4b99a8', 'Neutral Grip Plate-Loaded Machine Row', true)
const TEMPLATES = [BENCH, LEG_PRESS, CUSTOM_ROW]

const MAPPING: ExerciseMapping = {
  'Barbell Bench Press': { id: '79D0BB3A', title: 'Bench Press (Barbell)' },
  '45° Leg Press': { id: 'C7973E0E', title: 'Leg Press (Machine)' },
}

/** The resolutions as `name → source:template title`, for compact assertions. */
function summary(resolutions: Map<string, Resolution>) {
  return Object.fromEntries(
    [...resolutions].map(([name, r]) => [name, r.status === 'resolved' ? `${r.source}:${r.template.title}` : 'unresolved']),
  )
}

describe('resolveExercises', () => {
  it('resolves through the mapping, then custom templates by exact title', () => {
    const { resolutions, issues } = resolveExercises(
      ['Barbell Bench Press', 'Neutral Grip Plate-Loaded Machine Row', 'Snatch Grip Shrug'],
      TEMPLATES,
      MAPPING,
    )

    expect(issues).toEqual([])
    expect(summary(resolutions)).toEqual({
      'Barbell Bench Press': 'mapping:Bench Press (Barbell)',
      'Neutral Grip Plate-Loaded Machine Row': 'custom:Neutral Grip Plate-Loaded Machine Row',
      'Snatch Grip Shrug': 'unresolved',
    })
  })

  it('keeps the order of the names it was given', () => {
    const { resolutions } = resolveExercises(['Snatch Grip Shrug', '45° Leg Press', 'Barbell Bench Press'], TEMPLATES, MAPPING)

    expect([...resolutions.keys()]).toEqual(['Snatch Grip Shrug', '45° Leg Press', 'Barbell Bench Press'])
  })

  it('lets the user pick override the mapping', () => {
    const { resolutions } = resolveExercises(['45° Leg Press'], TEMPLATES, MAPPING, new Map([['45° Leg Press', BENCH.id]]))

    expect(summary(resolutions)).toEqual({ '45° Leg Press': 'choice:Bench Press (Barbell)' })
  })

  it('ignores a pick whose template the account does not have', () => {
    const { resolutions } = resolveExercises(['45° Leg Press'], TEMPLATES, MAPPING, new Map([['45° Leg Press', 'MISSING1']]))

    expect(summary(resolutions)).toEqual({ '45° Leg Press': 'mapping:Leg Press (Machine)' })
  })

  it('skips and reports a mapping entry whose template the account does not have', () => {
    const { resolutions, issues } = resolveExercises(['Barbell Bench Press'], [LEG_PRESS], MAPPING)

    expect(summary(resolutions)).toEqual({ 'Barbell Bench Press': 'unresolved' })
    expect(issues).toEqual([
      {
        severity: 'warning',
        message: '"Barbell Bench Press" is mapped to the Hevy template 79D0BB3A ("Bench Press (Barbell)"), which this account doesn\'t have.',
      },
    ])
  })

  it('uses a mapping entry whose title differs in the account, with a warning', () => {
    const renamed = template('79D0BB3A', 'Supino Reto (Barra)')
    const { resolutions, issues } = resolveExercises(['Barbell Bench Press'], [renamed], MAPPING)

    expect(summary(resolutions)).toEqual({ 'Barbell Bench Press': 'mapping:Supino Reto (Barra)' })
    expect(issues).toEqual([
      {
        severity: 'warning',
        message:
          '"Barbell Bench Press" is mapped to "Bench Press (Barbell)", but this account calls template 79D0BB3A "Supino Reto (Barra)". Check that it\'s the right exercise.',
      },
    ])
  })

  it('does not match built-in templates by title', () => {
    const builtInNamedLikeMacroFactor = template('ABCDEF12', 'Snatch Grip Shrug')
    const { resolutions } = resolveExercises(['Snatch Grip Shrug'], [builtInNamedLikeMacroFactor], {})

    expect(summary(resolutions)).toEqual({ 'Snatch Grip Shrug': 'unresolved' })
  })

  it('does not treat inherited object keys as mapping entries', () => {
    const { resolutions, issues } = resolveExercises(['constructor', 'toString'], TEMPLATES, MAPPING)

    expect(issues).toEqual([])
    expect(summary(resolutions)).toEqual({ constructor: 'unresolved', toString: 'unresolved' })
  })
})
