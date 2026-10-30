import type { HevyExerciseTemplate, HevyUser, HevyWorkout, NewExerciseTemplate, NewWorkout } from './types'

// The only module that talks to the network. The API key stays in this closure: it is sent as the
// `api-key` header to api.hevyapp.com and nowhere else, and it never appears in errors.

const BASE_URL = 'https://api.hevyapp.com'
const DAY_MS = 24 * 60 * 60 * 1000

/** A request Hevy answered with an error status. */
export class HevyError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, path: string, detail: string) {
    super(`Hevy answered ${status} to ${path}${detail ? `: ${detail}` : ''}`)
    this.name = 'HevyError'
    this.status = status
    this.path = path
  }
}

export interface HevyClient {
  /** Also the cheapest way to check that a key works. */
  userInfo(): Promise<HevyUser>
  /** Every built-in and custom template on the account. */
  exerciseTemplates(): Promise<HevyExerciseTemplate[]>
  /**
   * Workouts newest first, paging until a whole page started before `earliestDate` (minus a day,
   * so the cut is safe in any time zone). May include a few older workouts.
   */
  workoutsSince(earliestDate: string): Promise<HevyWorkout[]>
  createWorkout(workout: NewWorkout): Promise<HevyWorkout>
  /** Returns the new template's ID. */
  createExerciseTemplate(exercise: NewExerciseTemplate): Promise<string>
}

interface Page {
  page: number
  page_count: number
}

export function createHevyClient(
  apiKey: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): HevyClient {
  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'api-key': apiKey, accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const response = await fetchFn(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new HevyError(response.status, path, await errorDetail(response))
    return (await response.json()) as T
  }

  return {
    async userInfo() {
      return (await request<{ data: HevyUser }>('GET', '/v1/user/info')).data
    },

    async exerciseTemplates() {
      const templates: HevyExerciseTemplate[] = []
      for (let page = 1; ; page++) {
        const body = await request<Page & { exercise_templates: HevyExerciseTemplate[] }>(
          'GET',
          `/v1/exercise_templates?page=${page}&pageSize=100`,
        )
        templates.push(...body.exercise_templates)
        if (page >= body.page_count) return templates
      }
    },

    async workoutsSince(earliestDate) {
      const cutoff = Date.parse(`${earliestDate}T00:00:00Z`) - DAY_MS
      const workouts: HevyWorkout[] = []
      for (let page = 1; ; page++) {
        const body = await request<Page & { workouts: HevyWorkout[] }>('GET', `/v1/workouts?page=${page}&pageSize=10`)
        workouts.push(...body.workouts)
        const allOlder = body.workouts.every((w) => Date.parse(w.start_time) < cutoff)
        if (allOlder || page >= body.page_count) return workouts
      }
    },

    async createWorkout(workout) {
      // The spec says the created workout comes back as a single-element array.
      const body = await request<{ workout: HevyWorkout[] | HevyWorkout }>('POST', '/v1/workouts', { workout })
      return Array.isArray(body.workout) ? body.workout[0] : body.workout
    },

    async createExerciseTemplate(exercise) {
      // The spec types the ID as an integer, but custom template IDs are UUIDs.
      const body = await request<{ id: string | number }>('POST', '/v1/exercise_templates', { exercise })
      return String(body.id)
    },
  }
}

/** Hevy's `error` message when there is one, otherwise the start of the body. */
async function errorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') return parsed.error
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return text.slice(0, 200)
}
