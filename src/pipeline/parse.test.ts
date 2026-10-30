import { describe, expect, it } from 'vitest'
import { parseExport, type SetRow } from './parse'

// Reproduces the real export: a double-encoded BOM inside a quoted header cell, `°` double-encoded
// as `Â°`, CRLF line breaks, and no line break after the last row.
const HEADER =
  '"ï»¿""Date""",Workout Duration,Workout,Exercise,Exercise Base Weight (kg),Set Type,' +
  'Weight (kg),Reps,RIR,Duration,Distance short (m),Distance long (km)'

const exportOf = (...lines: string[]) => lines.join('\r\n')

const BLANK_ROW: Omit<SetRow, 'line' | 'exercise' | 'setType'> = {
  date: '2026-01-05',
  workoutDurationSeconds: 3000,
  workout: 'Full Body Split (Legs)',
  baseWeightKg: null,
  weightKg: null,
  reps: null,
  rir: null,
  durationSeconds: null,
  distanceShortMeters: null,
  distanceLongMeters: null,
}

describe('parseExport', () => {
  it('parses a double-encoded export', () => {
    const result = parseExport(
      exportOf(
        HEADER,
        '2026-01-05,3000,Full Body Split (Legs),45Â° Leg Press,53.5,Warm-Up Set,20,10,,,,',
        '2026-01-05,3000,Full Body Split (Legs),45Â° Leg Press,53.5,Standard Set,100,12,2,,,',
        '2026-01-05,3000,Full Body Split (Legs),Seated Dumbbell Overhead Press,,Standard Set,28,9,0.5,,,',
      ),
    )

    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      { ...BLANK_ROW, line: 2, exercise: '45° Leg Press', setType: 'Warm-Up Set', baseWeightKg: 53.5, weightKg: 20, reps: 10 },
      { ...BLANK_ROW, line: 3, exercise: '45° Leg Press', setType: 'Standard Set', baseWeightKg: 53.5, weightKg: 100, reps: 12, rir: 2 },
      { ...BLANK_ROW, line: 4, exercise: 'Seated Dumbbell Overhead Press', setType: 'Standard Set', weightKg: 28, reps: 9, rir: 0.5 },
    ])
  })

  it('parses a correctly encoded export the same way', () => {
    const result = parseExport(
      exportOf(
        '﻿Date,Workout Duration,Workout,Exercise,Exercise Base Weight (kg),Set Type,Weight (kg),Reps,RIR,Duration,Distance short (m),Distance long (km)',
        '2026-01-05,3000,Full Body Split (Legs),45° Leg Press,53.5,Standard Set,100,12,2,,,',
      ) + '\n',
    )

    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      { ...BLANK_ROW, line: 2, exercise: '45° Leg Press', setType: 'Standard Set', baseWeightKg: 53.5, weightKg: 100, reps: 12, rir: 2 },
    ])
  })

  it('reads columns by name, in any order', () => {
    const result = parseExport(
      exportOf(
        'Set Type,Reps,Exercise,Weight (kg),Date,Workout,Workout Duration',
        'Standard Set,8,Barbell Bench Press,60,2026-01-06,Push,2400',
      ),
    )

    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      { ...BLANK_ROW, line: 2, date: '2026-01-06', workoutDurationSeconds: 2400, workout: 'Push', exercise: 'Barbell Bench Press', setType: 'Standard Set', weightKg: 60, reps: 8 },
    ])
  })

  it('converts imperial units to kg and meters', () => {
    const result = parseExport(
      exportOf(
        'Date,Workout Duration,Workout,Exercise,Exercise Base Weight (lbs),Set Type,Weight (lb),Reps,Duration,Distance short (ft),Distance long (mi)',
        '2026-01-05,3000,Cardio,Sled Push,10,Standard Set,100,,,,',
        '2026-01-05,3000,Cardio,Running,,Standard Set,,,600,,2',
        '2026-01-05,3000,Cardio,Farmer Carry,,Standard Set,,,,150,',
      ),
    )

    expect(result.issues).toEqual([])
    const [sled, run, carry] = result.rows
    expect(sled.baseWeightKg).toBeCloseTo(4.536, 3)
    expect(sled.weightKg).toBeCloseTo(45.359, 3)
    expect(run.durationSeconds).toBe(600)
    expect(run.distanceLongMeters).toBeCloseTo(3218.688, 3)
    expect(carry.distanceShortMeters).toBeCloseTo(45.72, 2)
  })

  it('converts long distances in km to meters', () => {
    const result = parseExport(
      exportOf(
        'Date,Workout Duration,Workout,Exercise,Set Type,Duration,Distance long (km)',
        '2026-01-05,1800,Cardio,Running,Standard Set,1800,5.2',
      ),
    )

    expect(result.rows[0].distanceLongMeters).toBeCloseTo(5200, 6)
  })

  it('warns about unknown columns and still parses', () => {
    const result = parseExport(
      exportOf(
        'Date,Workout Duration,Workout,Exercise,Set Type,Notes',
        '2026-01-05,3000,Push,Barbell Bench Press,Standard Set,felt good',
      ),
    )

    expect(result.issues).toEqual([{ severity: 'warning', message: 'Ignoring unknown column "Notes".' }])
    expect(result.rows).toHaveLength(1)
  })

  it('rejects a file that lacks a required column', () => {
    const result = parseExport(exportOf('Date,Workout,Exercise,Set Type', '2026-01-05,Push,Barbell Bench Press,Standard Set'))

    expect(result.rows).toEqual([])
    expect(result.issues).toEqual([
      { severity: 'error', message: 'The required column "Workout Duration" is missing.' },
    ])
  })

  it('rejects a weight column with an unsupported unit or no unit', () => {
    const header = 'Date,Workout Duration,Workout,Exercise,Set Type,'
    const row = '2026-01-05,3000,Push,Barbell Bench Press,Standard Set,100'

    expect(parseExport(exportOf(header + 'Weight (st)', row)).issues).toEqual([
      { severity: 'error', message: 'Column "Weight (st)" uses the unit "st", which isn\'t supported.' },
    ])
    expect(parseExport(exportOf(header + 'Weight', row)).issues).toEqual([
      { severity: 'error', message: 'Column "Weight" has no unit.' },
    ])
  })

  it('skips and reports rows with invalid values, keeping the rest', () => {
    const result = parseExport(
      exportOf(
        'Date,Workout Duration,Workout,Exercise,Set Type,Weight (kg),Reps',
        '2026-01-05,3000,Push,Barbell Bench Press,Standard Set,60,8',
        '05/01/2026,3000,Push,Barbell Bench Press,Standard Set,60,8',
        '2026-01-05,3000,Push,,Standard Set,60.5kg,8.5',
        '2026-01-05,3000,Push,Barbell Bench Press,Standard Set,60',
      ),
    )

    expect(result.rows.map((r) => r.line)).toEqual([2])
    expect(result.issues).toEqual([
      { severity: 'error', line: 3, message: '"Date" has the invalid value "05/01/2026"; skipped.' },
      {
        severity: 'error',
        line: 4,
        message: '"Exercise" is empty; "Weight (kg)" has the invalid value "60.5kg"; "Reps" has the invalid value "8.5"; skipped.',
      },
      { severity: 'error', line: 5, message: 'Expected 7 cells but found 6; skipped.' },
    ])
  })

  it('ignores rows where every cell is empty', () => {
    const result = parseExport(
      exportOf('Date,Workout Duration,Workout,Exercise,Set Type', '2026-01-05,3000,Push,Barbell Bench Press,Standard Set', ',,,,'),
    )

    expect(result.issues).toEqual([])
    expect(result.rows).toHaveLength(1)
  })

  it('reports an empty file and a file with no sets', () => {
    expect(parseExport('').issues).toEqual([{ severity: 'error', message: 'The file is empty.' }])
    expect(parseExport('Date,Workout Duration,Workout,Exercise,Set Type\r\n').issues).toEqual([
      { severity: 'error', message: 'The file has no sets.' },
    ])
  })
})
