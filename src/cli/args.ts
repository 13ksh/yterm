export type CliOptions = {
  demo: boolean
  help: boolean
  fps: number
  cols: number | null
  rows: number | null
  frames: number | null
  noAlt: boolean
  target: string | null
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    demo: false,
    help: false,
    fps: 8,
    cols: null,
    rows: null,
    frames: null,
    noAlt: false,
    target: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--") continue

    if (arg === "-h" || arg === "--help") {
      opts.help = true
      continue
    }
    if (arg === "--demo") {
      opts.demo = true
      continue
    }
    if (arg === "--no-alt") {
      opts.noAlt = true
      continue
    }

    const kv = splitFlag(arg)
    if (kv) {
      applyFlag(opts, kv[0], kv[1])
      continue
    }

    if (arg.startsWith("--")) {
      const value = argv[i + 1]
      if (value == null || value.startsWith("-")) {
        throw new Error(`옵션 ${arg} 뒤에 값이 필요합니다`)
      }
      applyFlag(opts, arg.slice(2), value)
      i += 1
      continue
    }

    if (opts.target) {
      throw new Error("주소나 파일은 하나만 넣으세요")
    }
    opts.target = arg
  }

  if (opts.fps < 1 || opts.fps > 24) {
    throw new Error("fps는 1에서 24 사이여야 합니다")
  }

  return opts
}

function splitFlag(arg: string): [string, string] | null {
  if (!arg.startsWith("--") || !arg.includes("=")) return null
  const eq = arg.indexOf("=")
  return [arg.slice(2, eq), arg.slice(eq + 1)]
}

function applyFlag(opts: CliOptions, name: string, raw: string): void {
  const value = Number(raw)
  if (name === "fps") {
    if (!Number.isInteger(value)) throw new Error("fps는 정수여야 합니다")
    opts.fps = value
    return
  }
  if (name === "cols" || name === "width") {
    if (!Number.isInteger(value) || value < 16) {
      throw new Error("cols는 16 이상이어야 합니다")
    }
    opts.cols = value
    return
  }
  if (name === "rows") {
    if (!Number.isInteger(value) || value < 8) {
      throw new Error("rows는 8 이상이어야 합니다")
    }
    opts.rows = value
    return
  }
  if (name === "frames") {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error("frames는 1 이상이어야 합니다")
    }
    opts.frames = value
    return
  }
  throw new Error(`알 수 없는 옵션 --${name}`)
}

export const HELP = `ASCII 유튜브 — 컬러 아스키 아트 플레이어

유튜브 주소를 받아 8FPS로 터미널에 그립니다. 영상 파일은 받지 않고
스트림 URL만 열어 ffmpeg가 프레임을 파이프합니다.

사용:
  npm run ascii -- --demo
  npm run ascii -- https://www.youtube.com/watch?v=VIDEO_ID
  npm run ascii -- ./clip.mp4

조작:
  space   일시정지 / 이어보기
  q       종료

옵션:
  --demo          컬러 테스트 패턴 (네트워크 없이 확인)
  --fps 8         초당 프레임. 기본 8
  --cols 80       가로 칸 수
  --rows 24       세로 줄 수
  --frames N      N프레임 후 자동 종료 (테스트용)
  --no-alt        대체 화면 버퍼를 쓰지 않음
  -h, --help      이 도움말
`
