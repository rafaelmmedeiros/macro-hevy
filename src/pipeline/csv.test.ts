import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('splits CRLF records and keeps empty cells, with no final line break', () => {
    expect(parseCsv('a,b,\r\n1,,3')).toEqual([
      { line: 1, cells: ['a', 'b', ''] },
      { line: 2, cells: ['1', '', '3'] },
    ])
  })

  it('accepts LF and CR line breaks', () => {
    expect(parseCsv('a\nb\rc\n').map((r) => r.cells)).toEqual([['a'], ['b'], ['c']])
  })

  it('reads quoted cells with commas, escaped quotes and line breaks', () => {
    expect(parseCsv('"a,b","say ""hi""","two\r\nlines"\r\nnext')).toEqual([
      { line: 1, cells: ['a,b', 'say "hi"', 'two\r\nlines'] },
      { line: 3, cells: ['next'] },
    ])
  })

  it('skips blank lines but counts them', () => {
    expect(parseCsv('a\r\n\r\nb\r\n')).toEqual([
      { line: 1, cells: ['a'] },
      { line: 3, cells: ['b'] },
    ])
  })

  it('rejects a quoted cell that is never closed', () => {
    expect(() => parseCsv('a\r\n"b,c')).toThrow('line 2')
  })
})
