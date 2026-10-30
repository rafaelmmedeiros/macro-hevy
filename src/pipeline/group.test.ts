import { describe, expect, it } from 'vitest'
import { exerciseNames, groupWorkouts } from './group'
import type { SetRow } from './parse'

let nextLine = 2

function row(overrides: Partial<SetRow>): SetRow {
  return {
    line: nextLine++,
    date: '2026-01-05',
    workoutDurationSeconds: 3000,
    workout: 'Full Body Split (Push)',
    exercise: 'Barbell Bench Press',
    setType: 'Standard Set',
    baseWeightKg: null,
    weightKg: 60,
    reps: 8,
    rir: 2,
    durationSeconds: null,
    distanceShortMeters: null,
    distanceLongMeters: null,
    ...overrides,
  }
}

/** A compact view of the result: workout headers and, per exercise, the reps of each set. */
function outline(rows: SetRow[]) {
  return groupWorkouts(rows).map((w) => ({
    date: w.date,
    name: w.name,
    ordinal: w.ordinal,
    durationSeconds: w.durationSeconds,
    exercises: w.exercises.map((e) => `${e.name}: ${e.sets.map((s) => s.reps).join(',')}`),
  }))
}

describe('groupWorkouts', () => {
  it('groups consecutive rows that share date, duration and name, in file order', () => {
    expect(
      outline([
        row({ date: '2026-01-05', reps: 10 }),
        row({ date: '2026-01-05', reps: 9 }),
        row({ date: '2026-01-06', workout: 'Full Body Split (Pull)', workoutDurationSeconds: 2800, exercise: 'Barbell Row', reps: 12 }),
      ]),
    ).toEqual([
      { date: '2026-01-05', name: 'Full Body Split (Push)', ordinal: 1, durationSeconds: 3000, exercises: ['Barbell Bench Press: 10,9'] },
      { date: '2026-01-06', name: 'Full Body Split (Pull)', ordinal: 1, durationSeconds: 2800, exercises: ['Barbell Row: 12'] },
    ])
  })

  it('orders exercises by first appearance and appends sets of an exercise that comes back', () => {
    const [workout] = outline([
      row({ exercise: 'Barbell Bench Press', reps: 10 }),
      row({ exercise: 'Cable Fly', reps: 15 }),
      row({ exercise: 'Barbell Bench Press', reps: 6 }),
      row({ exercise: 'Cable Fly', reps: 12 }),
    ])

    expect(workout.exercises).toEqual(['Barbell Bench Press: 10,6', 'Cable Fly: 15,12'])
  })

  it('starts a new workout when only the duration changes', () => {
    const workouts = outline([row({ workoutDurationSeconds: 3000 }), row({ workoutDurationSeconds: 1200 })])

    expect(workouts.map((w) => [w.durationSeconds, w.ordinal])).toEqual([[3000, 1], [1200, 2]])
  })

  it('numbers workouts with the same name on the same date', () => {
    const workouts = outline([
      row({ date: '2026-01-05', workout: 'Push', workoutDurationSeconds: 3000 }),
      row({ date: '2026-01-05', workout: 'Cardio', workoutDurationSeconds: 1800 }),
      row({ date: '2026-01-05', workout: 'Push', workoutDurationSeconds: 1200 }),
      row({ date: '2026-01-06', workout: 'Push', workoutDurationSeconds: 3000 }),
    ])

    expect(workouts.map((w) => `${w.date} ${w.name} #${w.ordinal}`)).toEqual([
      '2026-01-05 Push #1',
      '2026-01-05 Cardio #1',
      '2026-01-05 Push #2',
      '2026-01-06 Push #1',
    ])
  })

  it('keeps every set field except the workout-level ones', () => {
    const source = row({ line: 7, setType: 'Warm-Up Set', baseWeightKg: 53.5, weightKg: 20, reps: 10, rir: null })
    const [workout] = groupWorkouts([source])

    expect(workout.exercises[0].sets).toEqual([
      {
        line: 7,
        setType: 'Warm-Up Set',
        baseWeightKg: 53.5,
        weightKg: 20,
        reps: 10,
        rir: null,
        durationSeconds: null,
        distanceShortMeters: null,
        distanceLongMeters: null,
      },
    ])
  })

  it('returns no workouts for no rows', () => {
    expect(groupWorkouts([])).toEqual([])
  })
})

describe('exerciseNames', () => {
  it('lists each exercise once, in order of first appearance across workouts', () => {
    const workouts = groupWorkouts([
      row({ date: '2026-01-05', exercise: 'Barbell Bench Press' }),
      row({ date: '2026-01-05', exercise: 'Cable Fly' }),
      row({ date: '2026-01-06', exercise: 'Barbell Row' }),
      row({ date: '2026-01-06', exercise: 'Barbell Bench Press' }),
    ])

    expect(exerciseNames(workouts)).toEqual(['Barbell Bench Press', 'Cable Fly', 'Barbell Row'])
  })
})
