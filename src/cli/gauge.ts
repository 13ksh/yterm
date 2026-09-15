const RED = "\x1b[38;2;255;0;0m"
const DIM = "\x1b[38;2;72;72;72m"
const WHITE = "\x1b[38;2;241;241;241m"
const MUTED = "\x1b[38;2;170;170;170m"
export const RESET = "\x1b[0m"

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}

export function percentLabel(ratio: number): string {
  const pct = Math.round(clampRatio(ratio) * 100)
  return `${String(pct).padStart(3, " ")}%`
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  return `${m}:${String(s).padStart(2, "0")}`
}

export function playheadRatio(
  elapsed: number,
  duration: number | null,
): number {
  if (duration == null || duration <= 0) return 0
  return clampRatio(elapsed / duration)
}

export type GaugeOptions = {
  ratio: number
  elapsed: number
  duration: number | null
  width: number
  paused?: boolean
}

export function renderGauge(opts: GaugeOptions): string {
  const ratio = clampRatio(opts.ratio)
  const pct = percentLabel(ratio)
  const time =
    opts.duration != null && opts.duration > 0
      ? `${formatTime(opts.elapsed)} / ${formatTime(opts.duration)}`
      : formatTime(opts.elapsed)
  const pause = opts.paused ? "  일시정지" : ""
  const suffix = ` ${pct}  ${time}${pause}`
  const inner = Math.max(8, opts.width - visibleLength(suffix) - 1)
  const filled = Math.round(ratio * inner)
  const empty = inner - filled
  const bar = `${RED}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET}`
  return `${bar}${WHITE}${suffix}${RESET}`
}

function visibleLength(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length
}

export function renderHelp(fps: number, width: number): string {
  const text = `space 일시정지  ·  q 종료  ·  ${fps} FPS 컬러 ASCII`
  if (text.length >= width) return `${MUTED}${text.slice(0, Math.max(0, width))}${RESET}`
  return `${MUTED}${text}${RESET}`
}

export function truncateTitle(title: string, width: number): string {
  const clean = title.replace(/\s+/g, " ").trim()
  if (clean.length <= width) return clean
  if (width <= 1) return "…"
  return `${clean.slice(0, width - 1)}…`
}
