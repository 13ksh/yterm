const HALF = "▀"
const RESET = "\x1b[0m"

export type Rgb = readonly [number, number, number]

export function pixelAt(
  rgb: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
): Rgb {
  if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0]
  const i = (y * width + x) * 3
  return [rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0]
}

export function frameByteSize(width: number, height: number): number {
  return width * height * 3
}

function pack(rgb: Rgb): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
}

function fg(rgb: Rgb): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
}

function bg(rgb: Rgb): string {
  return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
}

/**
 * Two vertical pixels per terminal cell via the ▀ half-block.
 * Top pixel is the foreground; bottom pixel is the background.
 */
export function renderAscii(
  rgb: Buffer,
  width: number,
  height: number,
): string {
  if (width <= 0 || height <= 0) return ""
  const lines: string[] = []

  for (let y = 0; y < height; y += 2) {
    let line = ""
    let lastFg = -1
    let lastBg = -1
    for (let x = 0; x < width; x++) {
      const top = pixelAt(rgb, width, height, x, y)
      const bottom =
        y + 1 < height ? pixelAt(rgb, width, height, x, y + 1) : ([0, 0, 0] as const)
      const packedFg = pack(top)
      const packedBg = pack(bottom)
      if (packedFg !== lastFg) {
        line += fg(top)
        lastFg = packedFg
      }
      if (packedBg !== lastBg) {
        line += bg(bottom)
        lastBg = packedBg
      }
      line += HALF
    }
    line += RESET
    lines.push(line)
  }

  return lines.join("\n")
}

export function fitCanvas(
  cols: number,
  rows: number,
  overlayRows = 3,
): { width: number; height: number } {
  const width = Math.max(16, cols)
  const charRows = Math.max(4, rows - overlayRows)
  let height = charRows * 2
  if (height % 2 !== 0) height -= 1
  return { width, height: Math.max(8, height) }
}
