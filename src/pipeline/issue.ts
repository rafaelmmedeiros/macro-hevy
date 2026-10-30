/** A problem found while processing an export, shown to the user before anything is written. */
export interface Issue {
  severity: 'error' | 'warning'
  /** 1-based line in the CSV file. Absent for problems that concern the whole file. */
  line?: number
  message: string
}
