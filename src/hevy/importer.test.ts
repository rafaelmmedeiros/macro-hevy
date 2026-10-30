import { describe, expect, it } from 'vitest'
import type { WorkoutDiff } from '../pipeline/diff'
import type { Workout } from '../pipeline/group'
import { HevyError } from './client'
import { importWorkouts, planImport, type ImportItem, type ImportOutcome } from './importer'
import type { HevyWorkout, NewWorkout } from './types'

const WORKOUT: Workout = { date: '2026-10-21', name: 'PPL (Legs)', ordinal: 1, durationSeconds: 3600, exercises: [] }

function hevyWorkout(id: string): HevyWorkout {
  return { id, title: 'Legs', description: null, start_time: '2026-10-21T21:00:00Z', end_time: '2026-10-21T22:00:00Z', exercises: [] }
}

function diff(key: string, status: WorkoutDiff['status']): WorkoutDiff {
  return { workout: WORKOUT, key, status }
}

describe('planImport', () => {
  const fresh = [
    diff('new', { kind: 'new', others: [] }),
    diff('done', { kind: 'imported', existing: hevyWorkout('h1') }),
    diff('accepted', { kind: 'conflict', conflicts: [hevyWorkout('h2')], others: [] }),
    diff('surprise', { kind: 'conflict', conflicts: [hevyWorkout('h3')], others: [] }),
    diff('unselected', { kind: 'new', others: [] }),
  ]

  it('imports new workouts and accepted conflicts, and explains the rest', () => {
    const plan = planImport(fresh, new Set(['new', 'done', 'accepted', 'surprise']), new Set(['accepted']))

    expect(plan.keys).toEqual(['new', 'accepted'])
    expect(plan.skipped).toEqual(
      new Map([
        ['done', 'It is already in Hevy.'],
        ['surprise', 'A similar workout showed up in Hevy on that date. Review it and try again.'],
      ]),
    )
  })
})

describe('importWorkouts', () => {
  const item = (key: string): ImportItem => ({ key, workout: { title: key } as NewWorkout })

  function client(failures: Record<string, HevyError>) {
    const created: string[] = []
    return {
      created,
      createWorkout: async (workout: NewWorkout) => {
        const failure = failures[workout.title]
        if (failure) throw failure
        created.push(workout.title)
        return hevyWorkout(`hevy-${workout.title}`)
      },
    }
  }

  async function run(fake: ReturnType<typeof client>, keys: string[]) {
    const outcomes: [string, ImportOutcome['status']][] = []
    await importWorkouts(fake, keys.map(item), (key, outcome) => outcomes.push([key, outcome.status]))
    return outcomes
  }

  it('creates the workouts in order and reports each one', async () => {
    const fake = client({})

    expect(await run(fake, ['a', 'b'])).toEqual([['a', 'imported'], ['b', 'imported']])
    expect(fake.created).toEqual(['a', 'b'])
  })

  it('goes on after a failure that only affects one workout', async () => {
    const fake = client({ a: new HevyError(400, '/v1/workouts', 'Invalid request body') })

    expect(await run(fake, ['a', 'b'])).toEqual([['a', 'failed'], ['b', 'imported']])
  })

  it('stops when the key is rejected or Hevy limits the rate', async () => {
    for (const status of [401, 429]) {
      const fake = client({ b: new HevyError(status, '/v1/workouts', '') })

      expect(await run(fake, ['a', 'b', 'c', 'd'])).toEqual([['a', 'imported'], ['b', 'failed'], ['c', 'skipped'], ['d', 'skipped']])
      expect(fake.created).toEqual(['a'])
    }
  })
})
