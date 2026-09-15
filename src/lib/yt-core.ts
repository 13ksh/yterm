export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export type Json = Record<string, unknown>

export function findAll(source: unknown, key: string): unknown[] {
  const found: unknown[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Json)) {
        if (k === key) found.push(v)
        walk(v)
      }
    }
  }
  walk(source)
  return found
}

export function parseBalancedObject(source: string, start: number): unknown {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return JSON.parse(source.slice(start, i + 1))
    }
  }
  throw new Error("JSON 객체를 닫지 못했습니다.")
}

export function extractYtCfg(html: string): Json {
  let searchFrom = 0
  while (searchFrom < html.length) {
    const idx = html.indexOf("ytcfg.set(", searchFrom)
    if (idx < 0) break
    const start = html.indexOf("{", idx)
    if (start < 0) break
    try {
      const parsed = parseBalancedObject(html, start) as Json
      if (typeof parsed.INNERTUBE_API_KEY === "string") return parsed
    } catch {
      // Keep scanning later ytcfg.set calls.
    }
    searchFrom = idx + 10
  }
  throw new Error("유튜브 페이지에서 API 설정을 찾지 못했습니다.")
}

export function extractYtInitialData(html: string): Json {
  const markers = ["ytInitialData = ", "ytInitialData=", 'ytInitialData"] = ']
  for (const marker of markers) {
    const idx = html.indexOf(marker)
    if (idx < 0) continue
    const start = html.indexOf("{", idx)
    if (start < 0) continue
    try {
      return parseBalancedObject(html, start) as Json
    } catch {
      // Try the next marker.
    }
  }
  throw new Error("영상 데이터를 읽지 못했습니다.")
}

export function parseLikeCount(label: string): number {
  const raw = label.replace(/,/g, "").trim()
  if (!raw) return 0
  const korean = raw.match(/^([\d.]+)\s*만$/)
  if (korean) return Math.round(parseFloat(korean[1]) * 10_000)
  const thousand = raw.match(/^([\d.]+)\s*천$/)
  if (thousand) return Math.round(parseFloat(thousand[1]) * 1_000)
  const k = raw.match(/^([\d.]+)\s*[kK]$/)
  if (k) return Math.round(parseFloat(k[1]) * 1_000)
  const m = raw.match(/^([\d.]+)\s*[mM]$/)
  if (m) return Math.round(parseFloat(m[1]) * 1_000_000)
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

export function runsToText(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""
  const record = value as Json
  if (typeof record.simpleText === "string") return record.simpleText
  if (Array.isArray(record.runs)) {
    return record.runs
      .map((run) =>
        run && typeof run === "object" && "text" in run
          ? String((run as { text: unknown }).text ?? "")
          : "",
      )
      .join("")
  }
  if (typeof record.content === "string") return record.content
  return ""
}

export function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null
}

export function continuationOf(value: unknown): Json | null {
  const obj = asObject(value)
  if (!obj) return null
  if (asObject(obj.continuationCommand)) return obj
  if (obj.command) return continuationOf(obj.command)
  if (asObject(obj.continuationEndpoint)) {
    return continuationOf(obj.continuationEndpoint)
  }
  return null
}

export function tokenOf(endpoint: Json): string {
  return String(asObject(endpoint.continuationCommand)?.token ?? "")
}

export async function fetchYoutubeHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      accept: "text/html,application/xhtml+xml",
      cookie:
        "CONSENT=YES+; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwODEzLjA3X3AxGgJlbiACGgYIgJnLsgY",
    },
    redirect: "follow",
  })
  if (!response.ok) {
    throw new Error("유튜브 페이지를 열지 못했습니다.")
  }
  const html = await response.text()
  if (html.includes("consent.youtube.com") && !html.includes("ytInitialData")) {
    throw new Error("유튜브 쿠키 동의 페이지에 막혔습니다. 잠시 후 다시 시도해 주세요.")
  }
  return html
}

export async function innertubePost(
  ytcfg: Json,
  apiUrl: string,
  payload: Json,
): Promise<Json | null> {
  const apiKey = typeof ytcfg.INNERTUBE_API_KEY === "string" ? ytcfg.INNERTUBE_API_KEY : ""
  if (!apiKey) return null

  const url = new URL(
    apiUrl.startsWith("http") ? apiUrl : `https://www.youtube.com${apiUrl}`,
  )
  url.searchParams.set("key", apiKey)
  url.searchParams.set("prettyPrint", "false")

  const context = asObject(ytcfg.INNERTUBE_CONTEXT) ?? {}
  const client = asObject(context.client) ?? {}
  client.hl = "ko"
  client.gl = "KR"
  context.client = client

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      "accept-language": "ko-KR,ko;q=0.9",
      origin: "https://www.youtube.com",
      referer: "https://www.youtube.com/",
    },
    body: JSON.stringify({ context, ...payload }),
  })
  if (!response.ok) return null
  return (await response.json()) as Json
}

export async function ajaxContinuation(
  endpoint: Json,
  ytcfg: Json,
): Promise<Json | null> {
  const meta = asObject(endpoint.commandMetadata)
  const web = asObject(meta?.webCommandMetadata)
  const continuation = asObject(endpoint.continuationCommand)
  const apiUrl = typeof web?.apiUrl === "string" ? web.apiUrl : "/youtubei/v1/next"
  const token = typeof continuation?.token === "string" ? continuation.token : ""
  if (!token) return null
  return innertubePost(ytcfg, apiUrl, { continuation: token })
}
