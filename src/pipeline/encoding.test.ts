import { describe, expect, it } from 'vitest'
import { repairMojibake } from './encoding'

describe('repairMojibake', () => {
  it('repairs double-encoded characters', () => {
    expect(repairMojibake('45Â° Leg Press')).toBe('45° Leg Press')
  })

  it('repairs a double-encoded BOM', () => {
    expect(repairMojibake('"ï»¿""Date""",Workout')).toBe('"﻿""Date""",Workout')
  })

  it('repairs characters that Windows-1252 maps above U+00FF', () => {
    expect(repairMojibake('Farmerâ€™s Walk')).toBe('Farmer’s Walk')
  })

  it('leaves correctly encoded text alone', () => {
    const text = '45° Leg Press, Crème Brûlée, Ávila'
    expect(repairMojibake(text)).toBe(text)
  })

  it('leaves text alone when the repaired bytes are not valid UTF-8', () => {
    const text = 'Â° and a real é'
    expect(repairMojibake(text)).toBe(text)
  })

  it('leaves text alone when it has characters Windows-1252 cannot hold', () => {
    const text = '45Â° Leg Press 日本'
    expect(repairMojibake(text)).toBe(text)
  })
})
