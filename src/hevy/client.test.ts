import { describe, expect, it } from 'vitest'
import { createHevyClient, HevyError } from './client'
import type { HevyWorkout, NewWorkout } from './types'

const API_KEY = '00000000-1111-2222-3333-444444444444'

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

/** A fake `fetch` that answers `METHOD /path?query` from a table and records every call. */
function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      url,
      headers: init?.headers as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    const route = routes[`${method} ${url.replace('https://api.hevyapp.com', '')}`]
    if (!route) return new Response('not found', { status: 404 })
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body)
    return new Response(body, { status: route.status ?? 200 })
  }
  return { fetchFn, calls }
}

function workoutStartingAt(startTime: string): HevyWorkout {
  return { id: startTime, title: 'W', description: null, start_time: startTime, end_time: startTime, exercises: [] }
}

describe('createHevyClient', () => {
  it('sends the key only as the api-key header, only to api.hevyapp.com', async () => {
    const { fetchFn, calls } = fakeFetch({
      'GET /v1/user/info': { body: { data: { id: 'u1', username: 'rafa', name: 'Rafa', url: '', weight_unit: 'kg', distance_unit: 'kilometers', is_pro: true } } },
    })

    const user = await createHevyClient(API_KEY, fetchFn).userInfo()

    expect(user.username).toBe('rafa')
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0].url).origin).toBe('https://api.hevyapp.com')
    expect(calls[0].url).not.toContain(API_KEY)
    expect(calls[0].headers['api-key']).toBe(API_KEY)
  })

  it('pages through every exercise template', async () => {
    const { fetchFn, calls } = fakeFetch({
      'GET /v1/exercise_templates?page=1&pageSize=100': { body: { page: 1, page_count: 2, exercise_templates: [{ id: 'A' }, { id: 'B' }] } },
      'GET /v1/exercise_templates?page=2&pageSize=100': { body: { page: 2, page_count: 2, exercise_templates: [{ id: 'C' }] } },
    })

    const templates = await createHevyClient(API_KEY, fetchFn).exerciseTemplates()

    expect(templates.map((t) => t.id)).toEqual(['A', 'B', 'C'])
    expect(calls).toHaveLength(2)
  })

  it('pages through workouts until a whole page is older than the earliest date', async () => {
    const { fetchFn, calls } = fakeFetch({
      'GET /v1/workouts?page=1&pageSize=10': {
        body: { page: 1, page_count: 9, workouts: [workoutStartingAt('2026-10-27T20:00:00+00:00'), workoutStartingAt('2026-10-20T01:30:00+00:00')] },
      },
      // Still within a day of the 19th, so it could be the 19th in a time zone ahead of UTC.
      'GET /v1/workouts?page=2&pageSize=10': {
        body: { page: 2, page_count: 9, workouts: [workoutStartingAt('2026-10-18T12:00:00+00:00'), workoutStartingAt('2026-10-15T12:00:00+00:00')] },
      },
      'GET /v1/workouts?page=3&pageSize=10': {
        body: { page: 3, page_count: 9, workouts: [workoutStartingAt('2026-10-17T23:00:00+00:00'), workoutStartingAt('2026-10-10T12:00:00+00:00')] },
      },
    })

    const workouts = await createHevyClient(API_KEY, fetchFn).workoutsSince('2026-10-19')

    expect(calls.map((c) => new URL(c.url).searchParams.get('page'))).toEqual(['1', '2', '3'])
    expect(workouts).toHaveLength(6)
  })

  it('stops paging workouts at the last page', async () => {
    const { fetchFn, calls } = fakeFetch({
      'GET /v1/workouts?page=1&pageSize=10': { body: { page: 1, page_count: 1, workouts: [workoutStartingAt('2026-10-27T20:00:00Z')] } },
    })

    await createHevyClient(API_KEY, fetchFn).workoutsSince('2026-10-19')

    expect(calls).toHaveLength(1)
  })

  it('creates a workout and returns it from the single-element array', async () => {
    const created = workoutStartingAt('2026-10-21T21:00:00Z')
    const { fetchFn, calls } = fakeFetch({ 'POST /v1/workouts': { status: 201, body: { workout: [created] } } })
    const workout: NewWorkout = {
      title: 'Legs',
      description: null,
      start_time: '2026-10-21T21:00:00Z',
      end_time: '2026-10-21T22:00:00Z',
      is_private: true,
      exercises: [],
    }

    expect(await createHevyClient(API_KEY, fetchFn).createWorkout(workout)).toEqual(created)
    expect(calls[0].body).toEqual({ workout })
    expect(calls[0].headers['content-type']).toBe('application/json')
  })

  it('returns the new custom template ID as a string', async () => {
    const { fetchFn, calls } = fakeFetch({ 'POST /v1/exercise_templates': { body: { id: 42 } } })
    const exercise = {
      title: 'Reverse V-Squat',
      exercise_type: 'weight_reps',
      equipment_category: 'machine',
      muscle_group: 'quadriceps',
      other_muscles: ['glutes'],
    } as const

    expect(await createHevyClient(API_KEY, fetchFn).createExerciseTemplate({ ...exercise, other_muscles: [...exercise.other_muscles] })).toBe('42')
    expect(calls[0].body).toEqual({ exercise })
  })

  it("throws a HevyError with Hevy's message, never the key", async () => {
    const { fetchFn } = fakeFetch({
      'POST /v1/exercise_templates': { status: 403, body: { error: 'exceeds-custom-exercise-limit' } },
      'GET /v1/user/info': { status: 401, body: 'InvalidApiKey' },
    })
    const client = createHevyClient(API_KEY, fetchFn)

    const limit = await client
      .createExerciseTemplate({ title: 'X', exercise_type: 'reps_only', equipment_category: 'none', muscle_group: 'other', other_muscles: [] })
      .catch((e: unknown) => e)
    expect(limit).toBeInstanceOf(HevyError)
    expect(limit).toMatchObject({ status: 403, message: 'Hevy answered 403 to /v1/exercise_templates: exceeds-custom-exercise-limit' })

    const invalid = await client.userInfo().catch((e: unknown) => e)
    expect(invalid).toMatchObject({ status: 401, message: 'Hevy answered 401 to /v1/user/info: InvalidApiKey' })
    expect(String((invalid as Error).message)).not.toContain(API_KEY)
  })
})
