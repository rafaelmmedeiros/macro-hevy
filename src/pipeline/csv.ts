export interface CsvRecord {
  /** 1-based line where the record starts. */
  line: number
  cells: string[]
}

/**
 * Splits RFC 4180 CSV text into records. Accepts CRLF, LF and CR line breaks, a missing final
 * line break, and quoted cells that contain commas, quotes or line breaks. Blank lines are skipped.
 */
export function parseCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let recordLine = 1
  let quoteLine = 1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
      quoteLine = line
    } else if (ch === ',') {
      cells.push(cell)
      cell = ''
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (cells.length > 0 || cell !== '') {
        cells.push(cell)
        records.push({ line: recordLine, cells })
      }
      cells = []
      cell = ''
      line++
      recordLine = line
    } else {
      cell += ch
    }
  }

  if (quoted) throw new Error(`The quoted cell that starts on line ${quoteLine} is never closed.`)
  if (cells.length > 0 || cell !== '') {
    cells.push(cell)
    records.push({ line: recordLine, cells })
  }
  return records
}
