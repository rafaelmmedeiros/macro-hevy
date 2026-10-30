import { describe, expect, it } from 'vitest'
import { findImportKey, importKey, markerLine } from './marker'

describe('importKey', () => {
  it('joins the date, an FNV-1a hash of the name, and the ordinal', () => {
    // 0xbf9cf968 is the published 32-bit FNV-1a test vector for "foobar".
    expect(importKey({ date: '2026-10-19', name: 'foobar', ordinal: 1 })).toBe('2026-10-19 · bf9cf968 · 1')
  })

  it('hashes the UTF-8 bytes, so non-ASCII names are stable', () => {
    const key = importKey({ date: '2026-10-19', name: 'Pernas (Glúteos)', ordinal: 2 })
    expect(key).toMatch(/^2026-10-19 · [0-9a-f]{8} · 2$/)
    expect(importKey({ date: '2026-10-19', name: 'Pernas (Glúteos)', ordinal: 2 })).toBe(key)
    expect(importKey({ date: '2026-10-19', name: 'Pernas (Gluteos)', ordinal: 2 })).not.toBe(key)
  })
})

describe('markerLine and findImportKey', () => {
  const key = '2026-10-19 · bf9cf968 · 1'

  it('writes a readable line that starts with "Imported from MacroFactor"', () => {
    expect(markerLine(key)).toBe('Imported from MacroFactor · 2026-10-19 · bf9cf968 · 1')
  })

  it('finds the key in a description with other lines around it', () => {
    expect(findImportKey(`Push/Pull/Legs\n${markerLine(key)}\nfelt strong`)).toBe(key)
  })

  it('tolerates spacing changes', () => {
    expect(findImportKey('Imported from MacroFactor·2026-10-19 ·  bf9cf968·01')).toBe(key)
  })

  it('returns null when there is no marker', () => {
    expect(findImportKey('Leg day')).toBeNull()
    expect(findImportKey('')).toBeNull()
    expect(findImportKey(null)).toBeNull()
  })
})
