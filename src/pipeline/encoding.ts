// MacroFactor exports are double-encoded: UTF-8 text that was decoded as Windows-1252 and then
// encoded as UTF-8 again. `°` (C2 B0) arrives as `Â°` and the BOM (EF BB BF) as `ï»¿`.

/** Code points that Windows-1252 assigns to bytes 0x80–0x9F. */
const CP1252_HIGH = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
])

const CP1252_HIGH_CHARS = [...CP1252_HIGH.keys()].map((code) => String.fromCharCode(code)).join('')

/** A UTF-8 lead byte (C2–F4) followed by a continuation byte (80–BF), both read as Windows-1252. */
const DOUBLE_ENCODED = new RegExp(`[\\u00C2-\\u00F4][\\u0080-\\u00BF${CP1252_HIGH_CHARS}]`)

/**
 * Undoes double UTF-8 encoding. Text without the telltale pattern, or text that does not decode
 * cleanly once repaired, is returned unchanged, so correctly encoded exports pass through.
 */
export function repairMojibake(text: string): string {
  if (!DOUBLE_ENCODED.test(text)) return text

  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const byte = code <= 0xff ? code : CP1252_HIGH.get(code)
    if (byte === undefined) return text
    bytes[i] = byte
  }

  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return text
  }
}
