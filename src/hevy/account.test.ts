import { describe, expect, it } from 'vitest'
import { HevyError } from './client'
import { connect, describeError, MalformedKeyError } from './account'

const API_KEY = '00000000-1111-2222-3333-444444444444'

function fakeFetch(userStatus: number) {
  const paths: string[] = []
  const fetchFn: typeof fetch = async (input) => {
    const path = String(input).replace('https://api.hevyapp.com', '')
    paths.push(path)
    if (path === '/v1/user/info') {
      return userStatus === 200
        ? Response.json({ data: { id: 'u1', username: 'rafa', name: 'Rafa', url: '', weight_unit: 'kg', distance_unit: 'kilometers', is_pro: true } })
        : new Response('InvalidApiKey', { status: userStatus })
    }
    if (path.startsWith('/v1/exercise_templates')) return Response.json({ page: 1, page_count: 1, exercise_templates: [{ id: 'A' }] })
    return Response.json({ page: 1, page_count: 1, workouts: [] })
  }
  return { fetchFn, paths }
}

describe('connect', () => {
  it('checks the key, then loads templates and workouts', async () => {
    const { fetchFn, paths } = fakeFetch(200)

    const account = await connect(` ${API_KEY}\n`, '2026-10-19', fetchFn)

    expect(account.user.username).toBe('rafa')
    expect(account.templates).toHaveLength(1)
    expect(account.workouts).toEqual([])
    expect(paths[0]).toBe('/v1/user/info')
    expect(paths).toHaveLength(3)
  })

  it('stops after the key check when Hevy rejects the key', async () => {
    const { fetchFn, paths } = fakeFetch(401)

    await expect(connect(API_KEY, '2026-10-19', fetchFn)).rejects.toBeInstanceOf(HevyError)
    expect(paths).toEqual(['/v1/user/info'])
  })

  it('rejects text that is not shaped like a key without calling Hevy', async () => {
    const { fetchFn, paths } = fakeFetch(200)

    await expect(connect('my password', '2026-10-19', fetchFn)).rejects.toBeInstanceOf(MalformedKeyError)
    expect(paths).toEqual([])
  })
})

describe('describeError', () => {
  it('explains the errors a user can act on', () => {
    expect(describeError(new HevyError(401, '/v1/user/info', 'InvalidApiKey'))).toContain("didn't accept this key")
    expect(describeError(new HevyError(429, '/v1/workouts', ''))).toContain('too many requests')
    expect(describeError(new TypeError('Failed to fetch'))).toContain("Couldn't reach Hevy")
    expect(describeError(new HevyError(500, '/v1/workouts', 'oops'))).toBe('Hevy answered 500 to /v1/workouts: oops')
  })
})
