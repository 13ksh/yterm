import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { Readable } from "node:stream"
import { fitCanvas, frameByteSize, renderAscii } from "./ascii"
import {
  playheadRatio,
  renderGauge,
  renderHelp,
  truncateTitle,
} from "./gauge"
import type { CliOptions } from "./args"
import {
  ffmpegRawArgs,
  findFfmpeg,
  resolveSource,
  type PlaySource,
} from "./source"

const HOME = "\x1b[H"
const CLEAR = "\x1b[2J"
const HIDE = "\x1b[?25l"
const SHOW = "\x1b[?25h"
const ALT_ON = "\x1b[?1049h"
const ALT_OFF = "\x1b[?1049l"
const WHITE = "\x1b[38;2;241;241;241m"
const RESET = "\x1b[0m"

export async function play(opts: CliOptions): Promise<number> {
  const cols =
    opts.cols ??
    process.stdout.columns ??
    80
  const rows =
    opts.rows ??
    process.stdout.rows ??
    24
  const { width, height } = fitCanvas(cols, rows)
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
  let nextDue = performance.now()

  const restore = installTerminal(opts.noAlt, tty, (key) => {
    if (key === "q" || key === "\u0003") {
      quitting = true
      if (paused) {
        try {
          ffmpeg.kill("SIGCONT")
        } catch {
          /* ignore */
        }
      }
      ffmpeg.kill("SIGTERM")
      return
    }
    if (key === " ") {
      paused = !paused
      if (paused) ffmpeg.kill("SIGSTOP")
      else {
        ffmpeg.kill("SIGCONT")
        nextDue = performance.now()
      }
    }
  })

  writeScreen(opts.noAlt)
  process.stdout.write(
    `${HOME}${CLEAR}${WHITE}${truncateTitle(`불러오는 중 · ${source.title}`, cols)}${RESET}\n`,
  )

  try {
    while (!quitting) {
      if (opts.frames != null && frameIndex >= opts.frames) break

      while (paused && !quitting) {
        draw(source, lastFrame, width, height, cols, frameIndex, opts.fps, true)
        await sleep(80)
      }
      if (quitting) break

      const raw = await reader.read(frameSize)
      if (!raw || raw.length < frameSize) break

      const now = performance.now()
      const wait = nextDue - now
      if (wait > 0) await sleep(wait)
      if (now - nextDue > frameMs * 4) nextDue = performance.now()
      nextDue += frameMs

      lastFrame = raw
      draw(source, raw, width, height, cols, frameIndex, opts.fps, paused)
      frameIndex += 1
    }
    if (frameIndex === 0) {
      throw new Error(
        "프레임을 만들지 못했습니다. ffmpeg 입력 또는 yt-dlp 스트림을 확인하세요.",
      )
    }
    return 0
  } finally {
    try {
      ffmpeg.kill("SIGCONT")
    } catch {
      /* ignore */
    }
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
  frameIndex: number,
  fps: number,
  paused: boolean,
): void {
  const elapsed = frameIndex / fps
  const ratio = playheadRatio(elapsed, source.duration)
  const title = truncateTitle(source.title, cols)
  const art =
    rgb != null
      ? renderAscii(rgb, width, height)
      : " ".repeat(Math.max(0, height / 2))
  const gauge = renderGauge({
    ratio,
    elapsed,
    duration: source.duration,
    width: cols,
    paused,
  })
  const help = renderHelp(fps, cols)
  process.stdout.write(
    `${HOME}${WHITE}${title}${RESET}\n${art}\n${gauge}\n${help}`,
  )
}

function installTerminal(
  noAlt: boolean,
  raw: boolean,
  onKey: (key: string) => void,
): () => void {
  if (!noAlt) process.stdout.write(ALT_ON)
  process.stdout.write(HIDE)

  let rawOn = false
  const onData = (buf: Buffer | string) => {
    const s = typeof buf === "string" ? buf : buf.toString("utf8")
    for (const ch of s) onKey(ch)
  }

  if (raw && process.stdin.setRawMode) {
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
    if (rawOn) {
      process.stdin.off("data", onData)
      try {
        process.stdin.setRawMode(false)
      } catch {
        /* ignore */
      }
      process.stdin.pause()
    }
    process.stdout.write(SHOW)
    if (!noAlt) process.stdout.write(ALT_OFF)
    else process.stdout.write("\n")
  }
}

function writeScreen(noAlt: boolean): void {
  if (noAlt) process.stdout.write(CLEAR)
  process.stdout.write(HOME)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class ByteReader {
  private leftover = Buffer.alloc(0)
  private ended = false

  constructor(private readonly stream: Readable) {
    this.stream.on("end", () => {
      this.ended = true
    })
  }

  async read(size: number): Promise<Buffer | null> {
    while (this.leftover.length < size) {
      if (this.ended && this.leftover.length === 0) return null
      if (this.ended) {
        const last = this.leftover
        this.leftover = Buffer.alloc(0)
        return last
      }
      const chunk = await this.nextChunk()
      if (chunk == null) {
        this.ended = true
        continue
      }
      this.leftover = Buffer.concat([this.leftover, chunk])
    }
    const out = this.leftover.subarray(0, size)
    this.leftover = this.leftover.subarray(size)
    return out
  }

  private nextChunk(): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      const onData = (c: Buffer) => {
        cleanup()
        resolve(c)
      }
      const onEnd = () => {
        cleanup()
        resolve(null)
      }
      const onErr = (e: Error) => {
        cleanup()
        reject(e)
      }
      const cleanup = () => {
        this.stream.off("data", onData)
        this.stream.off("end", onEnd)
        this.stream.off("error", onErr)
      }
      this.stream.once("data", onData)
      this.stream.once("end", onEnd)
      this.stream.once("error", onErr)
    })
  }
}
