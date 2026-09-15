import type { FlatComment } from "./tree"
import {
  USER_AGENT,
  ajaxContinuation,
  asObject,
  continuationOf,
  extractYtCfg,
  extractYtInitialData,
  fetchYoutubeHtml,
  findAll,
  parseLikeCount,
  runsToText,
  tokenOf,
  type Json,
} from "./yt-core"

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
    if (
      !COMMENT_SECTION_IDS.has(targetId) &&
      !targetId.startsWith("comment-replies-item")
    ) {
      continue
    }
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
  preview?: boolean
}): Promise<VideoComments> {
  const { videoId, sort, preview = false } = options
  const SAFETY_CAP = 50_000
  const REPLY_BATCH = 8
  const budgetMs = 270_000
  const started = Date.now()
  const hasTime = () => Date.now() - started < budgetMs
  const underCap = () => collected.size < SAFETY_CAP
  const seenTokens = new Set<string>()
  const collected = new Map<string, FlatComment>()
  const enqueue = (endpoint: Json | null, queue: Json[]) => {
    if (!endpoint) return
    const token = tokenOf(endpoint)
    if (!token || seenTokens.has(token)) return
    seenTokens.add(token)
    queue.push(endpoint)
  }
  const html = await fetchYoutubeHtml(
    `https://www.youtube.com/watch?v=${videoId}&hl=ko&gl=KR`,
  )
  const ytcfg = extractYtCfg(html)
  const initial = extractYtInitialData(html)
  const oembed = await fetchOEmbed(videoId).catch(() => null)

  const sortIndex = sort === "recent" ? 1 : 0
  let sortMenu = findAll(initial, "sortFilterSubMenuRenderer")
    .map((renderer) => asObject(renderer)?.subMenuItems)
    .find((items) => Array.isArray(items) && items.length > 0) as unknown[] | undefined

  const pageQueue: Json[] = []
  const replyQueue: Json[] = []

  if (!sortMenu) {
    const itemSection = findAll(initial, "itemSectionRenderer")[0]
    const renderer = itemSection ? findAll(itemSection, "continuationItemRenderer")[0] : null
    const first =
      continuationOf(asObject(renderer)?.continuationEndpoint) ??
      continuationOf(findAll(initial, "continuationEndpoint")[0])
    if (first) {
      const boot = await ajaxContinuation(first, ytcfg)
      if (boot) {
        collectComments(boot, collected)
        for (const item of collectReplyEndpoints(boot)) enqueue(item.endpoint, replyQueue)
        for (const next of collectNextPageEndpoints(boot)) enqueue(next, pageQueue)
        sortMenu = findAll(boot, "sortFilterSubMenuRenderer")
          .map((renderer) => asObject(renderer)?.subMenuItems)
          .find((items) => Array.isArray(items) && items.length > 0) as unknown[] | undefined
      }
    }
  }

  if (sortMenu && sortMenu.length > sortIndex) {
    enqueue(continuationOf(asObject(sortMenu[sortIndex])?.serviceEndpoint), pageQueue)
  } else {
    enqueue(continuationOf(findAll(initial, "continuationEndpoint")[0]), pageQueue)
  }

  while (pageQueue.length && hasTime() && underCap()) {
    const endpoint = pageQueue.shift()
    if (!endpoint) break

    const response = await ajaxContinuation(endpoint, ytcfg)
    if (!response) continue

    const error = findAll(response, "externalErrorMessage")[0]
    if (typeof error === "string" && error) throw new Error(error)

    collectComments(response, collected)
    for (const item of collectReplyEndpoints(response)) enqueue(item.endpoint, replyQueue)
    for (const next of collectNextPageEndpoints(response)) enqueue(next, pageQueue)
    if (preview) break
  }

  if (!preview) {
  while (replyQueue.length && hasTime() && underCap()) {
    const batch = replyQueue.splice(0, REPLY_BATCH)
    const responses = await Promise.all(batch.map((endpoint) => ajaxContinuation(endpoint, ytcfg)))
    for (const response of responses) {
      if (!response) continue
      collectComments(response, collected)
      for (const item of collectReplyEndpoints(response)) enqueue(item.endpoint, replyQueue)
      for (const next of collectNextPageEndpoints(response)) enqueue(next, replyQueue)
    }
  }
  }

  const comments = [...collected.values()]
  const topLevel = comments.filter((comment) => !comment.parentId)
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
