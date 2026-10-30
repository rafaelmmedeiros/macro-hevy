import { createHevyClient, HevyError, type HevyClient } from './client'
import type { HevyExerciseTemplate, HevyUser, HevyWorkout } from './types'

/** Everything the wizard needs from Hevy after the key is accepted. */
export interface HevyAccount {
  client: HevyClient
  user: HevyUser
  templates: HevyExerciseTemplate[]
  /** Workouts from about a day before `earliestDate` on. */
  workouts: HevyWorkout[]
}

const API_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Thrown before any request when the pasted text can't be a Hevy API key. */
export class MalformedKeyError extends Error {
  constructor() {
    super("This doesn't look like a Hevy API key, which has the form 1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f.")
    this.name = 'MalformedKeyError'
  }
}

/** Checks the key, then loads the templates and the workouts the review step compares against. */
export async function connect(apiKey: string, earliestDate: string, fetchFn?: typeof fetch): Promise<HevyAccount> {
  const key = apiKey.trim()
  if (!API_KEY.test(key)) throw new MalformedKeyError()

  const client = createHevyClient(key, fetchFn)
  const user = await client.userInfo()
  const [templates, workouts] = await Promise.all([client.exerciseTemplates(), client.workoutsSince(earliestDate)])
  return { client, user, templates, workouts }
}

/** A message for the user. Never includes the key, since neither the client nor this does. */
export function describeError(error: unknown): string {
  if (error instanceof MalformedKeyError) return error.message
  if (error instanceof HevyError && error.status === 401) {
    return "Hevy didn't accept this key. Check it at hevy.com/settings?developer. The API needs Hevy Pro."
  }
  if (error instanceof HevyError && error.status === 429) {
    return 'Hevy is getting too many requests. Wait a minute and try again.'
  }
  if (error instanceof HevyError) return error.message
  if (error instanceof TypeError) return "Couldn't reach Hevy. Check your connection and try again."
  return error instanceof Error ? error.message : String(error)
}
