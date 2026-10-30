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
    for (const [name, value] of entries) {
      const entry: { id: string; title: string; customTitle?: string } = value
      expect(name, name).toBe(name.trim())
      expect(['customTitle', 'id', 'title'], name).toEqual(expect.arrayContaining(Object.keys(entry)))
      expect(entry.id, name).toMatch(/^[0-9A-Z]{8}$/)
      expect(entry.title.trim(), name).not.toBe('')
      if (entry.customTitle !== undefined) {
        expect(entry.customTitle.trim(), name).not.toBe('')
        expect(entry.customTitle, name).toBe(entry.customTitle.trim())
      }
    }
  })

  it('has no mojibake in names', () => {
    for (const [name] of entries) expect(name).not.toMatch(/[ÂÃâ]/)
  })
})
