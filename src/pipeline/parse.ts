import { parseCsv, type CsvRecord } from './csv'
import { repairMojibake } from './encoding'
import type { Issue } from './issue'

/** One set from the export, with every quantity converted to kg, meters or seconds. */
export interface SetRow {
  /** 1-based line in the CSV file. */
  line: number
  /** Calendar date, `YYYY-MM-DD`. */
  date: string
  workoutDurationSeconds: number
  /** `Program (Day)`, as exported. */
  workout: string
  exercise: string
  /** As exported, for example `Standard Set` or `Warm-Up Set`. */
  setType: string
  baseWeightKg: number | null
  weightKg: number | null
  reps: number | null
  rir: number | null
  durationSeconds: number | null
  distanceShortMeters: number | null
  distanceLongMeters: number | null
}

export interface ParseResult {
  rows: SetRow[]
  issues: Issue[]
}

type Quantity = 'mass' | 'length'

// Factors to kg and meters. Only kg, m and km have been seen in real exports; the imperial
// spellings are guesses.
const UNIT_FACTORS: Record<Quantity, ReadonlyMap<string, number>> = {
  mass: new Map([['kg', 1], ['lb', 0.45359237], ['lbs', 0.45359237]]),
  length: new Map([['m', 1], ['km', 1000], ['ft', 0.3048], ['yd', 0.9144], ['mi', 1609.344]]),
}

interface ColumnSpec {
  /** The header as MacroFactor writes it, without the unit. Matched case-insensitively. */
  name: string
  required: boolean
  /** Set for columns whose header carries a unit, like `Weight (kg)`. */
  quantity?: Quantity
}

type ColumnKey =
  | 'date' | 'workoutDuration' | 'workout' | 'exercise' | 'setType' | 'baseWeight' | 'weight'
  | 'reps' | 'rir' | 'duration' | 'distanceShort' | 'distanceLong'

const COLUMNS: Record<ColumnKey, ColumnSpec> = {
  date: { name: 'Date', required: true },
  workoutDuration: { name: 'Workout Duration', required: true },
  workout: { name: 'Workout', required: true },
  exercise: { name: 'Exercise', required: true },
  setType: { name: 'Set Type', required: true },
  baseWeight: { name: 'Exercise Base Weight', required: false, quantity: 'mass' },
  weight: { name: 'Weight', required: false, quantity: 'mass' },
  reps: { name: 'Reps', required: false },
  rir: { name: 'RIR', required: false },
  duration: { name: 'Duration', required: false },
  distanceShort: { name: 'Distance short', required: false, quantity: 'length' },
  distanceLong: { name: 'Distance long', required: false, quantity: 'length' },
}

const COLUMN_KEYS = Object.keys(COLUMNS) as ColumnKey[]

interface Column {
  index: number
  /** The header as it appears in the file, for messages. */
  label: string
  /** Multiplier to kg or meters; 1 for columns without a unit. */
  factor: number
}

type Columns = Partial<Record<ColumnKey, Column>>

const DATE = /^\d{4}-\d{2}-\d{2}$/
const INTEGER = /^\d+$/
const DECIMAL = /^-?\d+(\.\d+)?$/
const UNSIGNED_DECIMAL = /^\d+(\.\d+)?$/
const HEADER_WITH_UNIT = /^(.*?)\s*\(([^)]*)\)$/

/** Parses a MacroFactor workout export into set rows. Rows with invalid values are skipped and reported. */
export function parseExport(text: string): ParseResult {
  let records: CsvRecord[]
  try {
    records = parseCsv(repairMojibake(text))
  } catch (error) {
    return { rows: [], issues: [{ severity: 'error', message: (error as Error).message }] }
  }

  const [header, ...body] = records
  if (!header) return { rows: [], issues: [{ severity: 'error', message: 'The file is empty.' }] }

  const issues: Issue[] = []
  const columns = resolveColumns(header.cells, issues)
  if (!columns) return { rows: [], issues }

  const rows: SetRow[] = []
  for (const record of body) {
    if (record.cells.every((cell) => cell.trim() === '')) continue
    const row = parseRow(record, header.cells.length, columns, issues)
    if (row) rows.push(row)
  }

  if (rows.length === 0 && !issues.some((issue) => issue.severity === 'error')) {
    issues.push({ severity: 'error', message: 'The file has no sets.' })
  }
  return { rows, issues }
}

/** The header cell without the BOM, the stray quotes around it, or extra whitespace. */
function cleanHeader(cell: string): string {
  return cell.replace(/[﻿"]/g, '').replace(/\s+/g, ' ').trim()
}

/** Maps known columns by name. Returns null when the file can't be read at all. */
function resolveColumns(cells: string[], issues: Issue[]): Columns | null {
  const columns: Columns = {}
  let readable = true

  cells.forEach((cell, index) => {
    const label = cleanHeader(cell)
    const normalized = label.toLowerCase()
    const withUnit = HEADER_WITH_UNIT.exec(normalized)
    const key = COLUMN_KEYS.find((k) => {
      const { name, quantity } = COLUMNS[k]
      const expected = name.toLowerCase()
      return quantity ? (withUnit?.[1] ?? normalized) === expected : normalized === expected
    })

    if (!key) {
      issues.push({ severity: 'warning', message: `Ignoring unknown column "${label}".` })
      return
    }
    if (columns[key]) return

    const quantity = COLUMNS[key].quantity
    if (!quantity) {
      columns[key] = { index, label, factor: 1 }
      return
    }

    const unit = withUnit?.[2].trim()
    const factor = unit === undefined ? undefined : UNIT_FACTORS[quantity].get(unit)
    if (factor === undefined) {
      const message = unit === undefined
        ? `Column "${label}" has no unit.`
        : `Column "${label}" uses the unit "${unit}", which isn't supported.`
      issues.push({ severity: 'error', message })
      readable = false
      return
    }
    columns[key] = { index, label, factor }
  })

  for (const key of COLUMN_KEYS) {
    if (COLUMNS[key].required && !columns[key]) {
      issues.push({ severity: 'error', message: `The required column "${COLUMNS[key].name}" is missing.` })
      readable = false
    }
  }
  return readable ? columns : null
}

function truncate(value: number | null): number | null {
  return value === null ? null : Math.trunc(value)
}

function parseRow(record: CsvRecord, width: number, columns: Columns, issues: Issue[]): SetRow | null {
  const { line, cells } = record
  if (cells.length !== width) {
    issues.push({ severity: 'error', line, message: `Expected ${width} cells but found ${cells.length}; skipped.` })
    return null
  }

  const problems: string[] = []

  const text = (key: ColumnKey): string => {
    const column = columns[key]
    return column ? cells[column.index].trim() : ''
  }

  const invalid = (key: ColumnKey, value: string) => {
    problems.push(`"${columns[key]!.label}" has the invalid value "${value}"`)
  }

  // Required columns are always present; resolveColumns rejects the file otherwise.
  const required = (key: ColumnKey, pattern?: RegExp): string => {
    const value = text(key)
    if (value === '') problems.push(`"${columns[key]!.label}" is empty`)
    else if (pattern && !pattern.test(value)) invalid(key, value)
    return value
  }

  const number = (key: ColumnKey, pattern: RegExp): number | null => {
    const value = text(key)
    if (value === '') return null
    if (!pattern.test(value)) {
      invalid(key, value)
      return null
    }
    return Number(value) * columns[key]!.factor
  }

  const row: SetRow = {
    line,
    date: required('date', DATE),
    workoutDurationSeconds: Number(required('workoutDuration', INTEGER)),
    workout: required('workout'),
    exercise: required('exercise'),
    setType: required('setType'),
    baseWeightKg: number('baseWeight', DECIMAL),
    weightKg: number('weight', DECIMAL),
    // MacroFactor logs a partial rep as a fraction (11.33). Hevy only takes whole reps, so the
    // fraction is dropped.
    reps: truncate(number('reps', UNSIGNED_DECIMAL)),
    rir: number('rir', DECIMAL),
    durationSeconds: number('duration', DECIMAL),
    distanceShortMeters: number('distanceShort', DECIMAL),
    distanceLongMeters: number('distanceLong', DECIMAL),
  }

  if (problems.length > 0) {
    issues.push({ severity: 'error', line, message: `${problems.join('; ')}; skipped.` })
    return null
  }
  return row
}
