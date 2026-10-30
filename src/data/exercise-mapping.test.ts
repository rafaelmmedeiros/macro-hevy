import { describe, expect, it } from 'vitest'
import mapping from './exercise-mapping.json'

// The mapping is edited by hand through community PRs, so its shape is checked here. Whether each
// ID exists in Hevy can only be checked against a real account.
describe('exercise-mapping.json', () => {
  const entries = Object.entries(mapping)

  it('is sorted by MacroFactor name, so diffs stay small', () => {
    const names = entries.map(([name]) => name)
    expect(names).toEqual([...names].sort())
  })

  it('has only well-formed entries', () => {
    for (const [name, entry] of entries) {
      expect(name, name).toBe(name.trim())
      expect(Object.keys(entry).sort(), name).toEqual(['id', 'title'])
      expect(entry.id, name).toMatch(/^[0-9A-Z]{8}$/)
      expect(entry.title.trim(), name).not.toBe('')
    }
  })

  it('has no mojibake in names', () => {
    for (const [name] of entries) expect(name).not.toMatch(/[ÂÃâ]/)
  })
})
