import { spawn } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
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

export type YtDlpBin = { cmd: string; prefix: string[] }

const DEMO_SECONDS = 12
const ID = /^[A-Za-z0-9_-]{11}$/

let cachedBin: YtDlpBin | null = null
let cachedCookies: string[] | null = null

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
    return resolveYoutube(videoId ? `https://www.youtube.com/watch?v=${videoId}` : target)
  }

  throw new Error(`파일을 찾을 수 없고 유튜브 주소도 아닙니다: ${target}`)
}

type YtJson = {
  id?: string
  title?: string
  duration?: number | null
  url?: string
  http_headers?: Record<string, string>
  requested_downloads?: Array<{ url?: string; http_headers?: Record<string, string> }>
  entries?: YtJson[]
  related_videos?: Array<{
    id?: string
    title?: string
    uploader?: string
    duration?: number
  }>
}

async function resolveYoutube(target: string): Promise<PlaySource> {
  let parsed: YtJson
  try {
    parsed = (await ytdlpJson(target, {
      extra: ["-f", "b[height<=480]/b[height<=720]/b"],
      playlist: false,
      cookies: true,
    })) as YtJson
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/sign in|not a bot|cookies/i.test(message)) {
      throw new Error(
        "유튜브가 봇 확인을 요구합니다. Edge나 Chrome에 유튜브 로그인한 뒤 이 창을 다시 열고 Enter 하세요.",
      )
    }
    throw err
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

export function lookOnPath(name: string): string | null {
  const dirs = (process.env.PATH ?? "").split(path.delimiter)
  const exts =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""]
  const wantsExt = path.extname(name) !== ""
  for (const dir of dirs) {
    if (!dir) continue
    if (wantsExt) {
      const full = path.join(dir, name)
      if (existsSync(full)) return full
      continue
    }
    for (const ext of exts) {
      const full = path.join(dir, name + ext)
      if (existsSync(full)) return full
    }
  }
  return null
}

function extraYtDlpPaths(): string[] {
  const home = homedir()
  const found: string[] = [
    path.join(home, ".local/bin/yt-dlp"),
    path.join(home, ".local/bin/yt-dlp.exe"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ]
  if (process.platform === "win32") {
    found.push(
      path.join(home, "AppData/Local/Programs/yt-dlp/yt-dlp.exe"),
      path.join(home, "scoop/apps/yt-dlp/current/yt-dlp.exe"),
    )
    for (const root of [
      path.join(home, "AppData/Roaming/Python"),
      path.join(home, "AppData/Local/Programs/Python"),
    ]) {
      try {
        for (const dir of readdirSync(root, { withFileTypes: true })) {
          if (!dir.isDirectory()) continue
          found.push(path.join(root, dir.name, "Scripts", "yt-dlp.exe"))
        }
      } catch {
        /* missing */
      }
    }
  }
  return found
}

function locateYtDlp(): YtDlpBin {
  const env = process.env.YT_DLP
  if (env) return { cmd: env, prefix: [] }

  for (const cmd of extraYtDlpPaths()) {
    if (existsSync(cmd)) return { cmd, prefix: [] }
  }

  const onPath = lookOnPath("yt-dlp")
  if (onPath) return { cmd: onPath, prefix: [] }

  const pythons: Array<[string, string[]]> =
    process.platform === "win32"
      ? [
          ["py", ["-3", "-m", "yt_dlp"]],
          ["python", ["-m", "yt_dlp"]],
          ["python3", ["-m", "yt_dlp"]],
        ]
      : [
          ["python3", ["-m", "yt_dlp"]],
          ["python", ["-m", "yt_dlp"]],
        ]
  for (const [cmd, prefix] of pythons) {
    const resolved = lookOnPath(cmd)
    if (resolved) return { cmd: resolved, prefix }
  }

  return { cmd: "yt-dlp", prefix: [] }
}

export function findYtDlp(): YtDlpBin {
  if (!cachedBin) cachedBin = locateYtDlp()
  return cachedBin
}

export function findFfmpeg(): string {
  return process.env.FFMPEG || lookOnPath("ffmpeg") || "ffmpeg"
}

export function findFfprobe(): string {
  return process.env.FFPROBE || lookOnPath("ffprobe") || "ffprobe"
}

function cookieArgSets(): string[][] {
  if (process.env.YT_DLP_COOKIES && existsSync(process.env.YT_DLP_COOKIES)) {
    return [["--cookies", process.env.YT_DLP_COOKIES]]
  }
  if (process.env.YT_DLP_BROWSER) {
    return [["--cookies-from-browser", process.env.YT_DLP_BROWSER]]
  }
  const browsers =
    process.platform === "win32"
      ? ["edge", "chrome", "firefox", "brave"]
      : ["chrome", "chromium", "firefox", "brave"]
  const fromBrowser = browsers.map((name) => ["--cookies-from-browser", name])
  // Windows CMD users are logged into Edge/Chrome; try those before a cookieless dump.
  return process.platform === "win32" ? [...fromBrowser, []] : [[], ...fromBrowser]
}

export type YtDlpJsonOpts = {
  extra?: string[]
  playlist?: boolean
  cookies?: boolean
}

export async function ytdlpJson(
  target: string,
  opts: YtDlpJsonOpts = {},
): Promise<unknown> {
  const bin = findYtDlp()
  const extra = opts.extra ?? []
  const sets =
    opts.cookies === false
      ? cachedCookies
        ? [cachedCookies]
        : [[]]
      : cachedCookies
        ? [cachedCookies, ...cookieArgSets().filter((s) => s.join() !== cachedCookies?.join())]
        : cookieArgSets()

  let lastErr: Error | null = null
  for (const cookies of sets) {
    try {
      const args = [
        ...bin.prefix,
        "-J",
        "--no-warnings",
        ...(opts.playlist
          ? []
          : [
              "--no-playlist",
              "--extractor-args",
              "youtube:player_client=android,web",
            ]),
        ...cookies,
        ...extra,
        "--",
        target,
      ]
      const raw = await runCapture(bin.cmd, args)
      const parsed: unknown = JSON.parse(raw)
      if (cookies.length) cachedCookies = cookies
      return parsed
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      const message = lastErr.message
      const needCookies = /sign in|not a bot|cookies|confirm.*not.*bot|HTTP Error 403/i.test(
        message,
      )
      if (!needCookies) throw lastErr
    }
  }
  throw lastErr ?? new Error("yt-dlp JSON을 읽지 못했습니다")
}

export function itemsFromYtDump(data: unknown): Array<{
  videoId: string
  title: string
  channel: string
  meta: string
  duration: string
}> {
  if (!data || typeof data !== "object") return []
  const obj = data as YtJson & { uploader?: string; channel?: string; view_count?: number }
  const bucket: unknown[] = []
  if (Array.isArray(obj.entries)) bucket.push(...obj.entries)
  else bucket.push(obj)
  if (Array.isArray(obj.related_videos)) bucket.push(...obj.related_videos)

  const seen = new Set<string>()
  const items: Array<{
    videoId: string
    title: string
    channel: string
    meta: string
    duration: string
  }> = []
  for (const raw of bucket) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as YtJson & {
      ie_key?: string
      uploader?: string
      channel?: string
      view_count?: number
    }
    const videoId = String(row.id ?? "")
    if (!ID.test(videoId) || seen.has(videoId)) continue
    const title = String(row.title ?? "").replace(/\s+/g, " ").trim()
    if (!title || title === "[Deleted video]" || title === "[Private video]") continue
    seen.add(videoId)
    const channel = String(row.uploader ?? row.channel ?? "").replace(/^@/, "")
    const views =
      typeof row.view_count === "number" && Number.isFinite(row.view_count)
        ? `조회 ${row.view_count.toLocaleString("ko-KR")}회`
        : ""
    items.push({
      videoId,
      title,
      channel,
      meta: views,
      duration: formatDuration(row.duration),
    })
  }
  return items
}

function formatDuration(sec: unknown): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return ""
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
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

function extraPath(): string {
  const home = homedir()
  const extra = [
    path.join(home, ".local/bin"),
    path.join(home, "AppData/Local/Microsoft/WindowsApps"),
  ]
  return [...extra, process.env.PATH ?? ""].join(path.delimiter)
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: extraPath(),
      },
      windowsHide: true,
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
