import type { FlatComment } from "./tree"

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const COMMENT_SECTION_IDS = new Set([
  "comments-section",
  "engagement-panel-comments-section",
  "shorts-engagement-panel-comments-section",
])

export type VideoComments = {
  videoId: string
  title: string
  channel: string
  thumbnailUrl: string
  comments: FlatComment[]
}

type Json = Record<string, unknown>

function findAll(source: unknown, key: string): unknown[] {
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

function parseBalancedObject(source: string, start: number): unknown {
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

function extractYtCfg(html: string): Json {
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

function extractYtInitialData(html: string): Json {
  const markers = ['ytInitialData = ', 'ytInitialData=', 'ytInitialData"] = ']
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

function parseLikeCount(label: string): number {
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

function runsToText(value: unknown): string {
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

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null
}

function continuationOf(value: unknown): Json | null {
  const obj = asObject(value)
  if (!obj) return null
  if (asObject(obj.continuationCommand)) return obj
  if (obj.command) return continuationOf(obj.command)
  if (asObject(obj.continuationEndpoint)) {
    return continuationOf(obj.continuationEndpoint)
  }
  return null
}

function parseEntityComment(payload: unknown): FlatComment | null {
  const obj = asObject(payload)
  const properties = asObject(obj?.properties)
  const author = asObject(obj?.author)
  const toolbar = asObject(obj?.toolbar)
  if (!properties || !author) return null
  const id = String(properties.commentId ?? "")
  if (!id) return null
  const likeLabel = String(toolbar?.likeCountNotliked ?? "").trim() || "0"
  const isReply = id.includes(".")
  return {
    id,
    parentId: isReply ? id.slice(0, id.indexOf(".")) : null,
    author: String(author.displayName ?? "unknown").replace(/^@/, ""),
    text: runsToText(properties.content),
    likeCount: parseLikeCount(likeLabel),
    likeLabel,
    publishedTime: String(properties.publishedTime ?? ""),
  }
}

function parseLegacyComment(payload: unknown, parentId: string | null): FlatComment | null {
  const obj = asObject(payload)
  if (!obj) return null
  const id = String(obj.commentId ?? "")
  if (!id) return null
  const likeLabel = String(obj.voteCount ? runsToText(obj.voteCount) : obj.likeCount ?? "0")
  return {
    id,
    parentId: parentId ?? (id.includes(".") ? id.slice(0, id.indexOf(".")) : null),
    author: runsToText(obj.authorText).replace(/^@/, "") || "unknown",
    text: runsToText(obj.contentText),
    likeCount: parseLikeCount(likeLabel),
    likeLabel,
    publishedTime: runsToText(obj.publishedTimeText),
  }
}

function collectComments(data: unknown, into: Map<string, FlatComment>) {
  for (const payload of findAll(data, "commentEntityPayload")) {
    const comment = parseEntityComment(payload)
    if (comment && !into.has(comment.id)) into.set(comment.id, comment)
  }

  for (const thread of findAll(data, "commentThreadRenderer")) {
    const obj = asObject(thread)
    const comment = asObject(asObject(obj?.comment)?.commentRenderer) ?? asObject(obj?.comment)
    const parsed = parseLegacyComment(comment, null)
    if (parsed && !into.has(parsed.id)) into.set(parsed.id, parsed)
    const replies = asObject(obj?.replies)
    for (const reply of findAll(replies, "commentRenderer")) {
      const child = parseLegacyComment(reply, parsed?.id ?? null)
      if (child && !into.has(child.id)) into.set(child.id, child)
    }
  }
}

function extractTitle(data: unknown): string {
  for (const details of findAll(data, "videoDetails")) {
    const obj = asObject(details)
    if (typeof obj?.title === "string" && obj.title) return obj.title
  }
  for (const renderer of findAll(data, "videoPrimaryInfoRenderer")) {
    const title = runsToText(asObject(renderer)?.title)
    if (title) return title
  }
  return ""
}

function extractChannel(data: unknown): string {
  for (const details of findAll(data, "videoDetails")) {
    const obj = asObject(details)
    if (typeof obj?.author === "string" && obj.author) return obj.author
  }
  return ""
}

async function ajaxRequest(endpoint: Json, ytcfg: Json): Promise<Json | null> {
  const meta = asObject(endpoint.commandMetadata)
  const web = asObject(meta?.webCommandMetadata)
  const continuation = asObject(endpoint.continuationCommand)
  const apiUrl = typeof web?.apiUrl === "string" ? web.apiUrl : "/youtubei/v1/next"
  const token = typeof continuation?.token === "string" ? continuation.token : ""
  const apiKey = typeof ytcfg.INNERTUBE_API_KEY === "string" ? ytcfg.INNERTUBE_API_KEY : ""
  if (!token || !apiKey) return null

  const url = new URL(`https://www.youtube.com${apiUrl}`)
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
    body: JSON.stringify({ context, continuation: token }),
  })

  if (!response.ok) return null
  return (await response.json()) as Json
}

async function fetchOEmbed(videoId: string): Promise<{
  title: string
  channel: string
  thumbnailUrl: string
} | null> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } })
  if (!response.ok) return null
  const data = (await response.json()) as {
    title?: string
    author_name?: string
    thumbnail_url?: string
  }
  return {
    title: data.title ?? "",
    channel: data.author_name ?? "",
    thumbnailUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

function collectNextPageEndpoints(data: unknown): Json[] {
  const out: Json[] = []
  const actions = [
    ...findAll(data, "reloadContinuationItemsCommand"),
    ...findAll(data, "appendContinuationItemsAction"),
  ]
  for (const action of actions) {
    const obj = asObject(action)
    const targetId = String(obj?.targetId ?? "")
    if (!COMMENT_SECTION_IDS.has(targetId)) continue
    const items = Array.isArray(obj?.continuationItems) ? obj.continuationItems : []
    for (const item of items) {
      const renderer = asObject(asObject(item)?.continuationItemRenderer)
      if (!renderer) continue
      const cont = continuationOf(renderer.continuationEndpoint)
      if (cont) out.push(cont)
    }
  }
  return out
}

function collectReplyEndpoints(data: unknown): { parentId: string; endpoint: Json }[] {
  const out: { parentId: string; endpoint: Json }[] = []
  for (const renderer of findAll(data, "commentRepliesRenderer")) {
    const obj = asObject(renderer)
    const targetId = String(obj?.targetId ?? "")
    const parentId = targetId.replace(/^comment-replies-item-/, "")
    const fromThreads = continuationOf(findAll(renderer, "continuationEndpoint")[0])
    const fromButton = continuationOf(
      asObject(asObject(asObject(obj?.viewReplies)?.buttonRenderer)?.command),
    )
    const endpoint = fromThreads ?? fromButton
    if (parentId && endpoint) out.push({ parentId, endpoint })
  }
  return out
}

export async function fetchVideoComments(options: {
  videoId: string
  sort: "popular" | "recent"
  maxComments: number
}): Promise<VideoComments> {
  const { videoId, sort, maxComments } = options
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=ko&gl=KR`
  const page = await fetch(watchUrl, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      accept: "text/html,application/xhtml+xml",
      cookie:
        "CONSENT=YES+; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwODEzLjA3X3AxGgJlbiACGgYIgJnLsgY",
    },
    redirect: "follow",
  })

  if (!page.ok) {
    throw new Error("유튜브 영상 페이지를 열지 못했습니다.")
  }

  const html = await page.text()
  if (html.includes("consent.youtube.com") && !html.includes("ytInitialData")) {
    throw new Error("유튜브 쿠키 동의 페이지에 막혔습니다. 잠시 후 다시 시도해 주세요.")
  }

  const ytcfg = extractYtCfg(html)
  const initial = extractYtInitialData(html)
  const oembed = await fetchOEmbed(videoId).catch(() => null)

  const sortIndex = sort === "recent" ? 1 : 0
  let sortMenu = findAll(initial, "sortFilterSubMenuRenderer")
    .map((renderer) => asObject(renderer)?.subMenuItems)
    .find((items) => Array.isArray(items) && items.length > 0) as unknown[] | undefined

  const pageQueue: Json[] = []
  const replyEndpoints: { parentId: string; endpoint: Json }[] = []
  const collected = new Map<string, FlatComment>()

  if (!sortMenu) {
    const itemSection = findAll(initial, "itemSectionRenderer")[0]
    const renderer = itemSection ? findAll(itemSection, "continuationItemRenderer")[0] : null
    const first =
      continuationOf(asObject(renderer)?.continuationEndpoint) ??
      continuationOf(findAll(initial, "continuationEndpoint")[0])
    if (first) {
      const boot = await ajaxRequest(first, ytcfg)
      if (boot) {
        collectComments(boot, collected)
        replyEndpoints.push(...collectReplyEndpoints(boot))
        sortMenu = findAll(boot, "sortFilterSubMenuRenderer")
          .map((renderer) => asObject(renderer)?.subMenuItems)
          .find((items) => Array.isArray(items) && items.length > 0) as unknown[] | undefined
      }
    }
  }

  if (sortMenu && sortMenu.length > sortIndex) {
    const endpoint = continuationOf(asObject(sortMenu[sortIndex])?.serviceEndpoint)
    if (endpoint) pageQueue.push(endpoint)
  } else {
    const fallback = continuationOf(findAll(initial, "continuationEndpoint")[0])
    if (fallback) pageQueue.push(fallback)
  }

  const started = Date.now()
  const budgetMs = 18_000
  const seenTokens = new Set<string>()

  while (pageQueue.length && Date.now() - started < budgetMs) {
    const tops = [...collected.values()].filter((comment) => !comment.parentId).length
    if (tops >= maxComments) break

    const endpoint = pageQueue.shift()
    if (!endpoint) break
    const token = String(asObject(endpoint.continuationCommand)?.token ?? "")
    if (!token || seenTokens.has(token)) continue
    seenTokens.add(token)

    const response = await ajaxRequest(endpoint, ytcfg)
    if (!response) continue

    const error = findAll(response, "externalErrorMessage")[0]
    if (typeof error === "string" && error) throw new Error(error)

    collectComments(response, collected)
    replyEndpoints.push(...collectReplyEndpoints(response))
    if ([...collected.values()].filter((comment) => !comment.parentId).length < maxComments) {
      pageQueue.push(...collectNextPageEndpoints(response))
    }
  }

  const keepIds = new Set(
    [...collected.values()]
      .filter((comment) => !comment.parentId)
      .slice(0, maxComments)
      .map((comment) => comment.id),
  )
  const repliesToLoad = new Map<string, Json>()
  for (const item of replyEndpoints) {
    if (keepIds.has(item.parentId) && !repliesToLoad.has(item.parentId)) {
      repliesToLoad.set(item.parentId, item.endpoint)
    }
  }

  const replyList = [...repliesToLoad.values()]
  for (let i = 0; i < replyList.length && Date.now() - started < budgetMs; i += 5) {
    const batch = replyList.slice(i, i + 5)
    const responses = await Promise.all(batch.map((endpoint) => ajaxRequest(endpoint, ytcfg)))
    for (const response of responses) {
      if (response) collectComments(response, collected)
    }
  }

  const comments = [...collected.values()]
  const topLevel = comments.filter((comment) => !comment.parentId).slice(0, maxComments)
  const allowed = new Set(topLevel.map((comment) => comment.id))
  const replies = comments.filter(
    (comment) => comment.parentId && allowed.has(comment.parentId),
  )

  if (topLevel.length === 0) {
    throw new Error("댓글을 찾지 못했습니다. 댓글이 꺼진 영상이거나 유튜브가 요청을 막았습니다.")
  }

  return {
    videoId,
    title: extractTitle(initial) || oembed?.title || videoId,
    channel: extractChannel(initial) || oembed?.channel || "",
    thumbnailUrl:
      oembed?.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    comments: [...topLevel, ...replies],
  }
}
