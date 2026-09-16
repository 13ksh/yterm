const ANSI = /\x1b\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "")
}

/**
 * Terminal columns for one code point (East Asian Width).
 * Hangul / CJK / fullwidth / emoji occupy 2 columns. Control / combining = 0.
 */
export function charWidth(cp: number): number {
  if (cp === 0) return 0
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (cp >= 0x300 && cp <= 0x36f) return 0
  if (isWide(cp)) return 2
  return 1
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1aff0 && cp <= 0x1affe) ||
    (cp >= 0x1b000 && cp <= 0x1b122) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1fa00 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
}

export function displayWidth(text: string): number {
  let width = 0
  for (const ch of stripAnsi(text)) {
    width += charWidth(ch.codePointAt(0) ?? 0)
  }
  return width
}

export function clipToWidth(text: string, width: number): string {
  if (width <= 0) return ""
  if (displayWidth(text) <= width) return text
  const budget = Math.max(0, width - 1)
  let used = 0
  let out = ""
  for (const ch of stripAnsi(text)) {
    const w = charWidth(ch.codePointAt(0) ?? 0)
    if (used + w > budget) break
    out += ch
    used += w
  }
  return `${out}…`
}

export function padToWidth(text: string, width: number): string {
  if (width <= 0) return ""
  const clipped = clipToWidth(text, width)
  const extra = width - displayWidth(clipped)
  return extra > 0 ? `${clipped}${" ".repeat(extra)}` : clipped
}
