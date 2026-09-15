import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { parseVideoId } from "../lib/video-id"

export type PlaySource = {
  kind: "demo" | "file" | "youtube"
  title: string
  duration: number | null
  input: string
  prefixArgs: string[]
}

const DEMO_SECONDS = 12

export function demoSource(fps: number): PlaySource {
  return {
    kind: "demo",
    title: "테스트 패턴 · 컬러 ASCII",
    duration: DEMO_SECONDS,
    input: `testsrc2=size=1280x720:rate=${fps}:duration=${DEMO_SECONDS}`,
    prefixArgs: ["-f", "lavfi"],
  }
}

export async function resolveSource(
  target: string | null,
  demo: boolean,
  fps: number,
): Promise<PlaySource> {
  if (demo && !target) return demoSource(fps)
  if (!target) {
    throw new Error("유튜브 주소, 파일 경로, 또는 --demo 가 필요합니다")
  }
  if (demo) {
    throw new Error("--demo 와 주소를 같이 쓰지 마세요")
  }

  if (existsSync(target)) {
    const duration = await probeDuration(["-i", path.resolve(target)])
    return {
      kind: "file",
      title: path.basename(target),
      duration,
      input: path.resolve(target),
      prefixArgs: [],
    }
  }

  const videoId = parseVideoId(target)
  if (videoId || /^https?:\/\//i.test(target)) {
    return resolveYoutube(target)
  }

  throw new Error(`파일을 찾을 수 없고 유튜브 주소도 아닙니다: ${target}`)
}

type YtJson = {
  title?: string
  duration?: number | null
  url?: string
  http_headers?: Record<string, string>
  requested_downloads?: Array<{ url?: string; http_headers?: Record<string, string> }>
  entries?: YtJson[]
}

async function resolveYoutube(target: string): Promise<PlaySource> {
  const ytdlp = findYtDlp()
  const raw = await runCapture(ytdlp.cmd, [
    ...ytdlp.prefix,
    "-J",
    "--no-playlist",
    "--no-warnings",
    "-f",
    "b[height<=480]/b[height<=720]/b",
    "--",
    target,
  ])
  let parsed: YtJson
  try {
    parsed = JSON.parse(raw) as YtJson
  } catch {
    throw new Error("yt-dlp JSON을 읽지 못했습니다")
  }
  const info = parsed.entries?.[0] ?? parsed
  const download = info.requested_downloads?.[0]
  const url = download?.url ?? info.url
  if (!url) {
    throw new Error("유튜브 스트림 URL을 얻지 못했습니다 (다운로드는 하지 않습니다)")
  }
  const headers = download?.http_headers ?? info.http_headers ?? {}
  const headerBlock = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n")
  const prefixArgs = ["-reconnect", "1", "-reconnect_streamed", "1"]
  if (headerBlock) {
    prefixArgs.push("-headers", `${headerBlock}\r\n`)
  }

  const duration =
    typeof info.duration === "number" && Number.isFinite(info.duration)
      ? info.duration
      : null

  return {
    kind: "youtube",
    title: info.title?.trim() || "YouTube",
    duration,
    input: url,
    prefixArgs,
  }
}

export function findYtDlp(): { cmd: string; prefix: string[] } {
  const env = process.env.YT_DLP
  if (env) return { cmd: env, prefix: [] }

  const candidates = [
    path.join(homedir(), ".local/bin/yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ]
  for (const cmd of candidates) {
    if (existsSync(cmd)) return { cmd, prefix: [] }
  }
  return { cmd: "yt-dlp", prefix: [] }
}

export function findFfmpeg(): string {
  return process.env.FFMPEG || "ffmpeg"
}

export function findFfprobe(): string {
  return process.env.FFPROBE || "ffprobe"
}

async function probeDuration(inputArgs: string[]): Promise<number | null> {
  try {
    const out = await runCapture(findFfprobe(), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      ...inputArgs,
    ])
    const n = Number(out.trim())
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function ffmpegRawArgs(
  source: PlaySource,
  width: number,
  height: number,
  fps: number,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    ...source.prefixArgs,
    "-i",
    source.input,
    "-an",
    "-vf",
    `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=area,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=rgb24`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${path.join(homedir(), ".local/bin")}:${process.env.PATH ?? ""}`,
      },
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (c: Buffer) => stdout.push(c))
    child.stderr.on("data", (c: Buffer) => stderr.push(c))
    child.on("error", (err) => {
      reject(
        new Error(
          `${cmd} 실행 실패: ${err.message}. ffmpeg / yt-dlp 를 설치하세요.`,
        ),
      )
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"))
        return
      }
      const err = Buffer.concat(stderr).toString("utf8").trim()
      const snippet = err.split("\n").slice(-8).join("\n")
      reject(
        new Error(
          snippet
            ? `${cmd} 실패 (${code})\n${snippet}`
            : `${cmd} 가 종료 코드 ${code} 로 끝났습니다`,
        ),
      )
    })
  })
}
