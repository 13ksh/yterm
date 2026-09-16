import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { fitCanvas, frameByteSize, renderAscii } from "./ascii"
import { ByteReader } from "./bytes"
import {
  playheadRatio,
  renderGauge,
  renderHelp,
  truncateTitle,
} from "./gauge"
import type { CliOptions } from "./args"
import { clampScreen } from "./screen"
import {
  ffmpegRawArgs,
  findFfmpeg,
  resolveSource,
  type PlaySource,
} from "./source"
import { enableVt, termSize, useAltScreen } from "./vt"

const HOME = "\x1b[H"
const CLEAR = "\x1b[2J"
const HIDE = "\x1b[?25l"
const SHOW = "\x1b[?25h"
const ALT_ON = "\x1b[?1049h"
const ALT_OFF = "\x1b[?1049l"
const WHITE = "\x1b[38;2;241;241;241m"
const RESET = "\x1b[0m"

export type PlayHooks = {
  ownedScreen?: boolean
  onKey?: (handler: (key: string) => void) => () => void
  comments?: string[]
}

export async function play(opts: CliOptions, hooks: PlayHooks = {}): Promise<number> {
  enableVt()
  const { cols, rows } = termSize(opts.cols, opts.rows)
  const comments = hooks.comments ?? []
  const commentH = comments.length > 0 ? Math.max(5, Math.min(8, Math.floor(rows * 0.3))) : 0
  const overlay = 3 + (commentH ? commentH + 1 : 0)
  const { width, height } = fitCanvas(cols, rows, overlay)
  const source = await resolveSource(opts.target, opts.demo, opts.fps)
  const frameSize = frameByteSize(width, height)
  const ffmpeg = spawnFfmpeg(source, width, height, opts.fps)
  const reader = new ByteReader(ffmpeg.stdout)

  const tty = Boolean(process.stdin.isTTY) && opts.frames == null
  let paused = false
  let quitting = false
  let frameIndex = 0
  let lastFrame: Buffer | null = null
  const frameMs = 1000 / opts.fps
  let nextDue = 0

  const restore = installTerminal(opts.noAlt || Boolean(hooks.ownedScreen), tty, (key) => {
    if (key === "q" || key === "\u0003") {
      quitting = true
      ffmpeg.kill("SIGTERM")
      return
    }
    if (key === " ") {
      paused = !paused
      nextDue = paused ? nextDue : performance.now()
    }
  }, hooks)

  writeScreen(opts.noAlt)
  process.stdout.write(
    `${HOME}${CLEAR}${WHITE}${truncateTitle(`불러오는 중 · ${source.title}`, cols)}${RESET}\n`,
  )

  try {
    while (!quitting) {
      if (opts.frames != null && frameIndex >= opts.frames) break

      while (paused && !quitting) {
        draw(source, lastFrame, width, height, cols, rows, frameIndex, opts.fps, true, comments, commentH)
        await sleep(80)
      }
      if (quitting) break

      const raw = await reader.read(frameSize)
      if (!raw || raw.length < frameSize) break

      const now = performance.now()
      if (nextDue === 0) {
        nextDue = now
      } else {
        const wait = nextDue - now
        if (wait > 0) await sleep(wait)
        if (performance.now() - nextDue > frameMs * 4) {
          nextDue = performance.now()
        }
      }
      nextDue += frameMs

      lastFrame = raw
      draw(source, raw, width, height, cols, rows, frameIndex, opts.fps, paused, comments, commentH)
      frameIndex += 1
    }
    if (frameIndex === 0) {
      throw new Error(
        "프레임을 만들지 못했습니다. ffmpeg 입력 또는 yt-dlp 스트림을 확인하세요.",
      )
    }
    return 0
  } finally {
    if (!ffmpeg.killed) ffmpeg.kill("SIGTERM")
    restore()
  }
}

function spawnFfmpeg(
  source: PlaySource,
  width: number,
  height: number,
  fps: number,
): ChildProcessWithoutNullStreams {
  const args = ffmpegRawArgs(source, width, height, fps)
  const child = spawn(findFfmpeg(), args, { stdio: ["ignore", "pipe", "pipe"] })
  child.stderr.setEncoding("utf8")
  let err = ""
  child.stderr.on("data", (c: string) => {
    err += c
    if (err.length > 4000) err = err.slice(-2000)
  })
  child.on("error", (e) => {
    throw new Error(`ffmpeg 실행 실패: ${e.message}`)
  })
  child.on("close", (code) => {
    if (code && code !== 0 && code !== 255 && err.trim()) {
      process.stderr.write(`${err.trim()}\n`)
    }
  })
  return child
}

function draw(
  source: PlaySource,
  rgb: Buffer | null,
  width: number,
  height: number,
  cols: number,
  rows: number,
  frameIndex: number,
  fps: number,
  paused: boolean,
  comments: string[],
  commentH: number,
): void {
  const elapsed = frameIndex / fps
  const ratio = playheadRatio(elapsed, source.duration)
  const title = truncateTitle(`영상 · ${source.title}`, cols)
  const art =
    rgb != null
      ? renderAscii(rgb, width, height)
      : Array.from({ length: Math.max(1, Math.floor(height / 2)) }, () => " ").join("\n")
  const gauge = renderGauge({
    ratio,
    elapsed,
    duration: source.duration,
    width: cols,
    paused,
  })
  const help = renderHelp(fps, cols)
  const lines = [title, ...art.split("\n"), gauge, help]
  if (commentH > 0) {
    lines.push(`댓글창 · [ ] 스크롤  ·  q 목록`)
    const slice = comments.slice(0, Math.max(1, commentH - 1))
    lines.push(...slice)
  }
  process.stdout.write(`\x1b[H${clampScreen(lines, rows, cols)}`)
}

function installTerminal(
  noAlt: boolean,
  raw: boolean,
  onKey: (key: string) => void,
  hooks: PlayHooks = {},
): () => void {
  const alt = !noAlt && !hooks.ownedScreen && useAltScreen()
  if (alt) process.stdout.write(ALT_ON)
  process.stdout.write(HIDE)

  let rawOn = false
  let unsub: (() => void) | null = null
  const onData = (buf: Buffer | string) => {
    const s = typeof buf === "string" ? buf : buf.toString("utf8")
    for (const ch of s) onKey(ch)
  }

  if (hooks.onKey) {
    unsub = hooks.onKey(onKey)
  } else if (raw && process.stdin.setRawMode) {
    process.stdin.setRawMode(true)
    rawOn = true
    process.stdin.resume()
    process.stdin.on("data", onData)
  }

  const onSig = () => onKey("q")
  process.on("SIGINT", onSig)
  process.on("SIGTERM", onSig)

  let restored = false
  return () => {
    if (restored) return
    restored = true
    process.off("SIGINT", onSig)
    process.off("SIGTERM", onSig)
    unsub?.()
    if (rawOn) {
      process.stdin.off("data", onData)
      try {
        process.stdin.setRawMode(false)
      } catch {
        /* ignore */
      }
      process.stdin.pause()
    }
    if (!hooks.ownedScreen) {
      process.stdout.write(SHOW)
      if (alt) process.stdout.write(ALT_OFF)
      else process.stdout.write("\n")
    }
  }
}

function writeScreen(noAlt: boolean): void {
  if (noAlt) process.stdout.write(CLEAR)
  process.stdout.write(HOME)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
