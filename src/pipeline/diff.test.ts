import { describe, expect, it } from 'vitest'
import type { HevyExerciseTemplate, HevyWorkout } from '../hevy/types'
import { diffWorkouts, localDateFormatter } from './diff'
import type { Workout } from './group'
import { importKey, markerLine } from './marker'
import type { Resolution } from './resolve'

const TIME_ZONE = 'America/Sao_Paulo'

function template(id: string, title: string): HevyExerciseTemplate {
  return { id, title, type: 'weight_reps', primary_muscle_group: 'other', secondary_muscle_groups: [], equipment: 'machine', is_custom: false }
}

const SQUAT = template('CC35A01F', 'Squat (Machine)')
const LEG_PRESS = template('C7973E0E', 'Leg Press (Machine)')

const RESOLUTIONS = new Map<string, Resolution>([
  ['Reverse V-Squat', { status: 'resolved', source: 'mapping', template: SQUAT }],
  ['45° Leg Press', { status: 'resolved', source: 'mapping', template: LEG_PRESS }],
  ['Snatch Grip Shrug', { status: 'unresolved' }],
])

function workout(date: string, name = 'PPL (Legs)', ordinal = 1): Workout {
  const sets = [{ line: 2, setType: 'Standard Set', baseWeightKg: null, weightKg: 100, reps: 10, rir: 2, durationSeconds: null, distanceShortMeters: null, distanceLongMeters: null }]
  return {
    date,
    name,
    ordinal,
    durationSeconds: 3600,
    exercises: [
      { name: 'Reverse V-Squat', sets },
      { name: '45° Leg Press', sets },
    ],
  }
}

let nextId = 1

function hevyWorkout(startTime: string, templateIds: string[], description: string | null = null): HevyWorkout {
  return {
    id: `hevy-${nextId++}`,
    title: 'Workout',
    description,
    start_time: startTime,
    end_time: startTime,
    created_at: startTime,
    exercises: templateIds.map((id) => ({ title: id, exercise_template_id: id })),
  }
}

const kinds = (diffs: ReturnType<typeof diffWorkouts>) => diffs.map((d) => d.status.kind)

describe('diffWorkouts', () => {
  it('marks a workout as imported when its marker is in Hevy', () => {
    const legs = workout('2026-10-21')
    const existing = hevyWorkout('2026-10-21T21:00:00Z', [SQUAT.id], `PPL\n${markerLine(importKey(legs))}`)

    const [diff] = diffWorkouts([legs], RESOLUTIONS, [existing], TIME_ZONE)

    expect(diff.key).toBe(importKey(legs))
    expect(diff.status).toEqual({ kind: 'imported', existing })
  })

  it('recognizes the marker whatever time the earlier import used', () => {
    const legs = workout('2026-10-21')
    const existing = hevyWorkout('2026-10-25T09:00:00Z', [], markerLine(importKey(legs)))

    expect(kinds(diffWorkouts([legs], RESOLUTIONS, [existing], TIME_ZONE))).toEqual(['imported'])
  })

  it('flags an unmarked same-day workout that shares an exercise as a conflict', () => {
    const byHand = hevyWorkout('2026-10-21T20:00:00Z', [LEG_PRESS.id, 'OTHER001'])
    const cardio = hevyWorkout('2026-10-21T23:00:00Z', ['D8F7F851'])

    const [diff] = diffWorkouts([workout('2026-10-21')], RESOLUTIONS, [byHand, cardio], TIME_ZONE)

    expect(diff.status).toEqual({ kind: 'conflict', conflicts: [byHand], others: [cardio] })
  })

  it('lists an unmarked same-day workout with no shared exercise without blocking', () => {
    const cardio = hevyWorkout('2026-10-21T23:00:00Z', ['D8F7F851'])

    const [diff] = diffWorkouts([workout('2026-10-21')], RESOLUTIONS, [cardio], TIME_ZONE)

    expect(diff.status).toEqual({ kind: 'new', others: [cardio] })
  })

  it('reads Hevy dates in the given time zone', () => {
    // 01:30 UTC on the 22nd is 22:30 on the 21st in São Paulo.
    const lateNight = hevyWorkout('2026-10-22T01:30:00+00:00', [SQUAT.id])

    expect(kinds(diffWorkouts([workout('2026-10-21'), workout('2026-10-22')], RESOLUTIONS, [lateNight], TIME_ZONE))).toEqual([
      'conflict',
      'new',
    ])
    expect(kinds(diffWorkouts([workout('2026-10-21'), workout('2026-10-22')], RESOLUTIONS, [lateNight], 'UTC'))).toEqual([
      'new',
      'conflict',
    ])
  })

  it('ignores marked Hevy workouts from other imports on the same date', () => {
    const otherImport = hevyWorkout('2026-10-21T21:00:00Z', [SQUAT.id], markerLine(importKey(workout('2026-10-21', 'PPL (Push)'))))

    const [diff] = diffWorkouts([workout('2026-10-21')], RESOLUTIONS, [otherImport], TIME_ZONE)

    expect(diff.status).toEqual({ kind: 'new', others: [] })
  })

  it('tells apart workouts with the same name on the same date by ordinal', () => {
    const first = workout('2026-10-21', 'PPL (Legs)', 1)
    const second = workout('2026-10-21', 'PPL (Legs)', 2)
    const existing = hevyWorkout('2026-10-21T21:00:00Z', [SQUAT.id], markerLine(importKey(first)))

    expect(kinds(diffWorkouts([first, second], RESOLUTIONS, [existing], TIME_ZONE))).toEqual(['imported', 'new'])
  })

  it('only counts resolved exercises when looking for shared ones', () => {
    const shrugOnly: Workout = { ...workout('2026-10-21'), exercises: [{ name: 'Snatch Grip Shrug', sets: [] }] }
    const byHand = hevyWorkout('2026-10-21T20:00:00Z', [SQUAT.id])

    expect(kinds(diffWorkouts([shrugOnly], RESOLUTIONS, [byHand], TIME_ZONE))).toEqual(['new'])
  })
})

describe('localDateFormatter', () => {
  it('formats the calendar date in the time zone', () => {
    const toDate = localDateFormatter(TIME_ZONE)
    expect(toDate('2026-10-22T01:30:00Z')).toBe('2026-10-21')
    expect(toDate('2026-10-22T03:30:00Z')).toBe('2026-10-22')
    expect(localDateFormatter('Asia/Tokyo')('2026-10-21T20:00:00Z')).toBe('2026-10-22')
  })
})
