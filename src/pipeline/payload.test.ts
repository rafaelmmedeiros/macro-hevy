import { describe, expect, it } from 'vitest'
import type { HevyExerciseTemplate } from '../hevy/types'
import type { Workout, WorkoutExercise, WorkoutSet } from './group'
import { buildWorkout, splitWorkoutName, type PayloadOptions } from './payload'
import type { Resolution } from './resolve'

function template(id: string, title: string, type = 'weight_reps'): HevyExerciseTemplate {
  return { id, title, type, primary_muscle_group: 'other', secondary_muscle_groups: [], equipment: 'machine', is_custom: false }
}

function set(overrides: Partial<WorkoutSet>): WorkoutSet {
  return {
    line: 2,
    setType: 'Standard Set',
    baseWeightKg: null,
    weightKg: null,
    reps: null,
    rir: null,
    durationSeconds: null,
    distanceShortMeters: null,
    distanceLongMeters: null,
    ...overrides,
  }
}

function workout(exercises: WorkoutExercise[], name = 'Push/Pull/Legs/Upper/Lower (Legs)'): Workout {
  return { date: '2026-10-21', name, ordinal: 1, durationSeconds: 3675, exercises }
}

function resolved(entries: Record<string, HevyExerciseTemplate>): Map<string, Resolution> {
  return new Map(Object.entries(entries).map(([name, t]) => [name, { status: 'resolved', source: 'mapping', template: t }]))
}

const OPTIONS: PayloadOptions = { startTime: new Date('2026-10-21T21:00:00.000Z'), isPrivate: false }

const LEG_PRESS = template('C7973E0E', 'Leg Press (Machine)')

describe('buildWorkout', () => {
  it('builds the POST body for a workout', () => {
    const result = buildWorkout(
      workout([
        {
          name: '45° Leg Press',
          sets: [
            set({ line: 2, setType: 'Warm-Up Set', baseWeightKg: 53.5, weightKg: 20, reps: 10 }),
            set({ line: 3, baseWeightKg: 53.5, weightKg: 160, reps: 13, rir: 3 }),
          ],
        },
      ]),
      resolved({ '45° Leg Press': LEG_PRESS }),
      OPTIONS,
    )

    expect(result.issues).toEqual([])
    expect(result.workout).toEqual({
      title: 'Legs',
      description: expect.stringMatching(/^Push\/Pull\/Legs\/Upper\/Lower\nImported from MacroFactor · 2026-10-21 · [0-9a-f]{8} · 1$/),
      start_time: '2026-10-21T21:00:00Z',
      end_time: '2026-10-21T22:01:15Z',
      is_private: false,
      exercises: [
        {
          exercise_template_id: 'C7973E0E',
          superset_id: null,
          notes: 'MacroFactor: 45° Leg Press',
          sets: [
            { type: 'warmup', weight_kg: 73.5, reps: 10, distance_meters: null, duration_seconds: null, custom_metric: null, rpe: null },
            { type: 'normal', weight_kg: 213.5, reps: 13, distance_meters: null, duration_seconds: null, custom_metric: null, rpe: 7 },
          ],
        },
      ],
    })
  })

  it('keeps two MacroFactor exercises that share a template as separate entries', () => {
    const triceps = template('B5EFBF9C', 'Overhead Triceps Extension (Cable)')
    const result = buildWorkout(
      workout([
        { name: 'Cable V-Bar Overhead Triceps Extension', sets: [set({ weightKg: 30, reps: 12 })] },
        { name: 'High Pulley Cable V-Bar Overhead Triceps Extension', sets: [set({ weightKg: 25, reps: 12 })] },
      ]),
      resolved({ 'Cable V-Bar Overhead Triceps Extension': triceps, 'High Pulley Cable V-Bar Overhead Triceps Extension': triceps }),
      OPTIONS,
    )

    expect(result.workout!.exercises.map((e) => [e.exercise_template_id, e.notes])).toEqual([
      ['B5EFBF9C', 'MacroFactor: Cable V-Bar Overhead Triceps Extension'],
      ['B5EFBF9C', 'MacroFactor: High Pulley Cable V-Bar Overhead Triceps Extension'],
    ])
  })

  it('refuses to build while an exercise is unresolved', () => {
    const result = buildWorkout(
      workout([{ name: 'Reverse V-Squat', sets: [set({ weightKg: 40, reps: 10 })] }]),
      new Map([['Reverse V-Squat', { status: 'unresolved' }]]),
      OPTIONS,
    )

    expect(result.workout).toBeNull()
    expect(result.issues).toEqual([{ severity: 'error', message: '"Reverse V-Squat" isn\'t matched to a Hevy exercise yet.' }])
  })

  it('uses the whole name as the title when there is no day in parentheses', () => {
    const result = buildWorkout(workout([{ name: '45° Leg Press', sets: [set({ reps: 10 })] }], 'Leg Day'), resolved({ '45° Leg Press': LEG_PRESS }), OPTIONS)

    expect(result.workout!.title).toBe('Leg Day')
    expect(result.workout!.description).toMatch(/^Imported from MacroFactor · /)
  })

  it('passes the privacy choice through', () => {
    const result = buildWorkout(workout([{ name: '45° Leg Press', sets: [set({ reps: 10 })] }]), resolved({ '45° Leg Press': LEG_PRESS }), {
      ...OPTIONS,
      isPrivate: true,
    })

    expect(result.workout!.is_private).toBe(true)
  })

  it('converts RIR to RPE only when Hevy accepts the result', () => {
    const rirs = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, null]
    const result = buildWorkout(
      workout([{ name: '45° Leg Press', sets: rirs.map((rir) => set({ reps: 10, rir })) }]),
      resolved({ '45° Leg Press': LEG_PRESS }),
      OPTIONS,
    )

    expect(result.workout!.exercises[0].sets.map((s) => s.rpe)).toEqual([10, 9.5, 9, 8.5, 8, 7.5, 7, null, 6, null, null])
  })

  it('clears floating-point noise from summed weights', () => {
    const result = buildWorkout(
      workout([{ name: '45° Leg Press', sets: [set({ weightKg: 0.2, baseWeightKg: 0.1, reps: 10 })] }]),
      resolved({ '45° Leg Press': LEG_PRESS }),
      OPTIONS,
    )

    expect(result.workout!.exercises[0].sets[0].weight_kg).toBe(0.3)
  })

  it('imports unknown set types as normal, with one warning per type', () => {
    const result = buildWorkout(
      workout([{ name: '45° Leg Press', sets: [set({ setType: 'Drop Set', reps: 8 }), set({ setType: 'Drop Set', reps: 6 })] }]),
      resolved({ '45° Leg Press': LEG_PRESS }),
      OPTIONS,
    )

    expect(result.workout!.exercises[0].sets.map((s) => s.type)).toEqual(['normal', 'normal'])
    expect(result.issues).toEqual([
      { severity: 'warning', message: 'The set type "Drop Set" isn\'t known, so those sets are imported as normal sets.' },
    ])
  })

  it('fits each set to its template type and reports values that are left out', () => {
    const result = buildWorkout(
      workout([
        { name: 'Weighted Push-Up', sets: [set({ weightKg: 10, reps: 15 })] },
        { name: 'Treadmill Run', sets: [set({ durationSeconds: 1800.4, distanceLongMeters: 5200, reps: 1 })] },
        { name: 'Sled Push', sets: [set({ baseWeightKg: 40, weightKg: 60, distanceShortMeters: 20.4 })] },
        { name: 'Plank', sets: [set({ durationSeconds: 60 })] },
      ]),
      resolved({
        'Weighted Push-Up': template('392887AA', 'Push Up', 'reps_only'),
        'Treadmill Run': template('243710DE', 'Treadmill', 'distance_duration'),
        'Sled Push': template('AC0A1BF3', 'Sled Push', 'short_distance_weight'),
        'Plank': template('C6C9B8A0', 'Plank', 'duration'),
      }),
      OPTIONS,
    )

    const fields = result.workout!.exercises.map(({ sets: [s] }) => [s.weight_kg, s.reps, s.distance_meters, s.duration_seconds])
    expect(fields).toEqual([
      [null, 15, null, null],
      [null, null, 5200, 1800],
      [100, null, 20, null],
      [null, null, null, 60],
    ])
    expect(result.issues).toEqual([
      { severity: 'warning', message: '"Weighted Push-Up" goes to "Push Up", which doesn\'t record weight, so its weight values are left out.' },
      { severity: 'warning', message: '"Treadmill Run" goes to "Treadmill", which doesn\'t record reps, so its reps values are left out.' },
    ])
  })

  it('sends every value for a template type it does not know', () => {
    const result = buildWorkout(
      workout([{ name: 'Mystery', sets: [set({ weightKg: 10, reps: 5, durationSeconds: 30 })] }]),
      resolved({ Mystery: template('ABCDEF12', 'Mystery Move', 'new_kind') }),
      OPTIONS,
    )

    const [s] = result.workout!.exercises[0].sets
    expect([s.weight_kg, s.reps, s.duration_seconds]).toEqual([10, 5, 30])
    expect(result.issues).toEqual([
      { severity: 'warning', message: '"Mystery Move" has the exercise type "new_kind", which this tool doesn\'t know, so every value is sent.' },
    ])
  })

  it('imports only the short distance when a set has both', () => {
    const result = buildWorkout(
      workout([{ name: 'Sled Push', sets: [set({ line: 9, weightKg: 60, distanceShortMeters: 20, distanceLongMeters: 1000 })] }]),
      resolved({ 'Sled Push': template('AC0A1BF3', 'Sled Push', 'short_distance_weight') }),
      OPTIONS,
    )

    expect(result.workout!.exercises[0].sets[0].distance_meters).toBe(20)
    expect(result.issues).toEqual([
      { severity: 'warning', line: 9, message: 'This set has both a short and a long distance. Only the short one is imported.' },
    ])
  })
})

describe('splitWorkoutName', () => {
  it('splits "Program (Day)"', () => {
    expect(splitWorkoutName('Push/Pull/Legs/Upper/Lower (Push)')).toEqual({ title: 'Push', program: 'Push/Pull/Legs/Upper/Lower' })
  })

  it('keeps names without a day, or with an empty one, whole', () => {
    expect(splitWorkoutName('Leg Day')).toEqual({ title: 'Leg Day', program: null })
    expect(splitWorkoutName('Leg Day ()')).toEqual({ title: 'Leg Day ()', program: null })
  })

  it('handles a day with no program before it', () => {
    expect(splitWorkoutName('(Push)')).toEqual({ title: 'Push', program: null })
  })
})
