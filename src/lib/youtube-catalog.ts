import { DEMO_COMMENTS, DEMO_TITLE } from "./demo"
import { fetchVideoComments } from "./fetch-comments"
import type { FlatComment } from "./tree"
import {
  asObject,
  continuationOf,
  extractYtCfg,
  extractYtInitialData,
  fetchYoutubeHtml,
  findAll,
  innertubePost,
  runsToText,
  tokenOf,
  type Json,
} from "./yt-core"

export type VideoItem = {
  videoId: string
  title: string
  channel: string
  meta: string
  duration: string
  demo?: boolean
}

export type CommentBundle = {
  title: string
  channel: string
  comments: FlatComment[]
}

export type ListPage = {
  items: VideoItem[]
  continuation: string | null
}

export type CatalogClient = {
  trending: () => Promise<ListPage>
  more: (token: string) => Promise<ListPage>
  related: (videoId: string) => Promise<ListPage>
  search: (query: string) => Promise<ListPage>
  comments: (videoId: string) => Promise<CommentBundle>
}

const ID = /^[A-Za-z0-9_-]{11}$/

export const DEMO_FEED: VideoItem[] = [
  {
    videoId: "demofeed001",
    title: DEMO_TITLE,
    channel: "예시 채널",
    meta: "조회 12만회 · 3일 전",
    duration: "8:12",
    demo: true,
  },
  {
    videoId: "demofeed002",
    title: "테스트 패턴 · 컬러 바",
    channel: "ffmpeg",
    meta: "조회 8.4만회 · 1주 전",
    duration: "0:12",
    demo: true,
  },
  {
    videoId: "demofeed003",
    title: "비 오는 창가 플레이리스트",
    channel: "야간버스",
    meta: "조회 41만회 · 2주 전",
    duration: "1:02:11",
    demo: true,
  },
  {
    videoId: "demofeed004",
    title: "키보드 소리만 8시간",
    channel: "타건실록",
    meta: "조회 19만회 · 5일 전",
    duration: "8:00:01",
    demo: true,
  },
  {
    videoId: "demofeed005",
    title: "서울 한강 야경 드라이브",
    channel: "로드캠",
    meta: "조회 7.1만회 · 4일 전",
    duration: "24:08",
    demo: true,
  },
  {
    videoId: "demofeed006",
    title: "첫 아스키 터미널 튜토리얼",
    channel: "yterm",
    meta: "조회 3.2만회 · 어제",
    duration: "11:40",
    demo: true,
  },
  {
    videoId: "demofeed007",
    title: "라면 끓이는 소리 ASMR",
    channel: "야식연구소",
    meta: "조회 62만회 · 3주 전",
    duration: "14:55",
    demo: true,
  },
  {
    videoId: "demofeed008",
    title: "방향키로 고르는 피드 설명",
    channel: "yterm",
    meta: "조회 9,104회 · 오늘",
    duration: "3:21",
    demo: true,
  },
  {
    videoId: "demofeed009",
    title: "추천 영상은 오른쪽 키로만",
    channel: "yterm",
    meta: "조회 2.8만회 · 2일 전",
    duration: "5:02",
    demo: true,
  },
  {
    videoId: "demofeed010",
    title: "댓글 트리는 c 키",
    channel: "yterm",
    meta: "조회 1.5만회 · 2일 전",
    duration: "4:44",
    demo: true,
  },
  {
    videoId: "demofeed011",
    title: "CMD UTF-8 설정 팁",
    channel: "윈도우터미널",
    meta: "조회 5.6만회 · 1개월 전",
    duration: "6:18",
    demo: true,
  },
  {
    videoId: "demofeed012",
    title: "두 번째 페이지 · 과부하 없이",
    channel: "yterm",
    meta: "조회 880회 · 방금",
    duration: "2:09",
    demo: true,
  },
]

const DEMO_PAGE_SIZE = 8

export function createDemoClient(): CatalogClient {
  return {
    async trending() {
      return {
        items: DEMO_FEED.slice(0, DEMO_PAGE_SIZE),
        continuation: "demo:8",
      }
    },
    async more(token) {
      const start = Number(token.replace(/^demo:/, ""))
      if (!Number.isFinite(start) || start >= DEMO_FEED.length) {
        return { items: [], continuation: null }
      }
      const items = DEMO_FEED.slice(start, start + DEMO_PAGE_SIZE)
      const next = start + items.length
      return {
        items,
        continuation: next < DEMO_FEED.length ? `demo:${next}` : null,
      }
    },
    async related(videoId) {
      const items = DEMO_FEED.filter((item) => item.videoId !== videoId).slice(0, 6)
      return { items, continuation: null }
    },
    async search(query) {
      const q = query.trim().toLowerCase()
      const items = DEMO_FEED.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.channel.toLowerCase().includes(q),
      )
      return { items, continuation: null }
    },
    async comments() {
      return {
        title: DEMO_TITLE,
        channel: "예시 채널",
        comments: DEMO_COMMENTS,
      }
    },
  }
}

function metaLine(...parts: string[]): string {
  return parts.filter(Boolean).join(" · ")
}

function parseStandardVideo(obj: Json | null): VideoItem | null {
  if (!obj) return null
  const videoId = String(obj.videoId ?? "")
  if (!ID.test(videoId)) return null
  const title =
    runsToText(obj.title) ||
    runsToText(obj.headline) ||
    String(asObject(obj.title)?.content ?? "")
  if (!title) return null
  const channel =
    runsToText(obj.longBylineText) ||
    runsToText(obj.shortBylineText) ||
    runsToText(obj.ownerText) ||
    ""
  const views = runsToText(obj.shortViewCountText) || runsToText(obj.viewCountText)
  const published = runsToText(obj.publishedTimeText)
  let overlayDuration = runsToText(obj.lengthText)
  if (!overlayDuration) {
    for (const overlay of findAll(obj, "thumbnailOverlayTimeStatusRenderer")) {
      overlayDuration = runsToText(asObject(overlay)?.text)
      if (overlayDuration) break
    }
  }
  return {
    videoId,
    title: title.replace(/\s+/g, " ").trim(),
    channel: channel.replace(/^@/, "").trim(),
    meta: metaLine(views, published),
    duration: overlayDuration,
  }
}

function parseLockup(obj: Json | null): VideoItem | null {
  if (!obj) return null
  const videoId = String(obj.contentId ?? obj.id ?? "")
  if (!ID.test(videoId)) return null
  const metadata = asObject(asObject(obj.metadata)?.lockupMetadataViewModel)
  const title =
    String(asObject(metadata?.title)?.content ?? "") ||
    runsToText(metadata?.title)
  if (!title) return null
  const rows = findAll(metadata, "metadataRows").flat()
  const bits: string[] = []
  for (const row of rows) {
    const text = runsToText(row)
    if (text) bits.push(text)
  }
  const channel = bits[0] ?? ""
  return {
    videoId,
    title: title.replace(/\s+/g, " ").trim(),
    channel: channel.replace(/^@/, ""),
    meta: metaLine(...bits.slice(1)),
    duration: "",
  }
}

export function collectVideos(data: unknown): VideoItem[] {
  const seen = new Set<string>()
  const items: VideoItem[] = []
  const push = (item: VideoItem | null) => {
    if (!item || seen.has(item.videoId)) return
    seen.add(item.videoId)
    items.push(item)
  }
  for (const renderer of findAll(data, "videoRenderer")) {
    push(parseStandardVideo(asObject(renderer)))
  }
  for (const renderer of findAll(data, "compactVideoRenderer")) {
    push(parseStandardVideo(asObject(renderer)))
  }
  for (const renderer of findAll(data, "gridVideoRenderer")) {
    push(parseStandardVideo(asObject(renderer)))
  }
  for (const renderer of findAll(data, "playlistVideoRenderer")) {
    push(parseStandardVideo(asObject(renderer)))
  }
  for (const renderer of findAll(data, "lockupViewModel")) {
    push(parseLockup(asObject(renderer)))
  }
  return items
}

export function firstContinuationToken(data: unknown): string | null {
  for (const renderer of findAll(data, "continuationItemRenderer")) {
    const endpoint =
      continuationOf(asObject(renderer)?.continuationEndpoint) ??
      continuationOf(renderer)
    if (!endpoint) continue
    const token = tokenOf(endpoint)
    if (token) return token
  }
  return null
}

let cachedCfg: Json | null = null

async function sessionCfg(): Promise<Json> {
  if (cachedCfg) return cachedCfg
  const html = await fetchYoutubeHtml("https://www.youtube.com/feed/trending?hl=ko&gl=KR")
  cachedCfg = extractYtCfg(html)
  return cachedCfg
}

export function createLiveClient(): CatalogClient {
  return {
    async trending() {
      const html = await fetchYoutubeHtml(
        "https://www.youtube.com/feed/trending?hl=ko&gl=KR",
      )
      cachedCfg = extractYtCfg(html)
      const data = extractYtInitialData(html)
      return {
        items: collectVideos(data),
        continuation: firstContinuationToken(data),
      }
    },
    async more(token) {
      const ytcfg = await sessionCfg()
      const data = await innertubePost(ytcfg, "/youtubei/v1/browse", {
        continuation: token,
      })
      if (!data) return { items: [], continuation: null }
      return {
        items: collectVideos(data),
        continuation: firstContinuationToken(data),
      }
    },
    async related(videoId) {
      const html = await fetchYoutubeHtml(
        `https://www.youtube.com/watch?v=${videoId}&hl=ko&gl=KR`,
      )
      cachedCfg = extractYtCfg(html)
      const initial = extractYtInitialData(html)
      let items = collectVideos(findAll(initial, "secondaryResults"))
      if (items.length === 0) items = collectVideos(initial)
      const next = await innertubePost(cachedCfg, "/youtubei/v1/next", { videoId })
      if (next) {
        const extra = collectVideos(next)
        const seen = new Set(items.map((item) => item.videoId))
        for (const item of extra) {
          if (item.videoId === videoId || seen.has(item.videoId)) continue
          seen.add(item.videoId)
          items.push(item)
        }
      }
      return {
        items: items.filter((item) => item.videoId !== videoId),
        continuation: null,
      }
    },
    async search(query) {
      const ytcfg = await sessionCfg()
      const data = await innertubePost(ytcfg, "/youtubei/v1/search", { query })
      if (!data) return { items: [], continuation: null }
      return {
        items: collectVideos(data),
        continuation: firstContinuationToken(data),
      }
    },
    async comments(videoId) {
      const result = await fetchVideoComments({
        videoId,
        sort: "popular",
        preview: true,
      })
      return {
        title: result.title,
        channel: result.channel,
        comments: result.comments,
      }
    },
  }
}

export type ListState = {
  title: string
  items: VideoItem[]
  continuation: string | null
  selected: number
  offset: number
  loading: boolean
  inflight: Promise<void> | null
}

export class YoutubeCatalog {
  feed: ListState
  related = new Map<string, ListState>()
  comments = new Map<string, CommentBundle>()
  commentInflight = new Map<string, Promise<CommentBundle>>()
  stats = {
    feedLoads: 0,
    moreLoads: 0,
    relatedLoads: 0,
    commentLoads: 0,
    searchLoads: 0,
  }
  source: "live" | "demo" = "demo"
  status = ""

  constructor(private readonly client: CatalogClient) {
    this.feed = emptyList("인기 급상승")
  }

  selectedVideo(list: ListState): VideoItem | null {
    return list.items[list.selected] ?? null
  }

  move(list: ListState, delta: number): boolean {
    if (list.items.length === 0) return false
    const next = Math.min(
      list.items.length - 1,
      Math.max(0, list.selected + delta),
    )
    if (next === list.selected) return false
    list.selected = next
    return true
  }

  async ensureFeed(): Promise<void> {
    if (this.feed.items.length > 0 || this.feed.inflight) return this.feed.inflight ?? undefined
    const work = (async () => {
      this.feed.loading = true
      this.stats.feedLoads += 1
      const page = await this.client.trending()
      this.feed.items = page.items
      this.feed.continuation = page.continuation
      this.feed.loading = false
      this.feed.selected = 0
    })()
    this.feed.inflight = work
    try {
      await work
    } finally {
      this.feed.inflight = null
      this.feed.loading = false
    }
  }

  async maybeLoadMore(list: ListState): Promise<void> {
    if (!list.continuation || list.inflight) return
    if (list.items.length === 0) return
    if (list.selected < list.items.length - 3) return
    const token = list.continuation
    const work = (async () => {
      this.stats.moreLoads += 1
      list.loading = true
      const page = await this.client.more(token)
      const seen = new Set(list.items.map((item) => item.videoId))
      for (const item of page.items) {
        if (seen.has(item.videoId)) continue
        seen.add(item.videoId)
        list.items.push(item)
      }
      list.continuation = page.continuation
      list.loading = false
    })()
    list.inflight = work
    try {
      await work
    } finally {
      list.inflight = null
      list.loading = false
    }
  }

  async openRelated(videoId: string): Promise<ListState> {
    const existing = this.related.get(videoId)
    if (existing) return existing
    const list = emptyList("추천 영상")
    this.related.set(videoId, list)
    const work = (async () => {
      this.stats.relatedLoads += 1
      list.loading = true
      const page = await this.client.related(videoId)
      list.items = page.items
      list.continuation = page.continuation
      list.loading = false
    })()
    list.inflight = work
    try {
      await work
    } finally {
      list.inflight = null
      list.loading = false
    }
    return list
  }

  async openComments(videoId: string): Promise<CommentBundle> {
    const cached = this.comments.get(videoId)
    if (cached) return cached
    const pending = this.commentInflight.get(videoId)
    if (pending) return pending
    const work = (async () => {
      this.stats.commentLoads += 1
      const bundle = await this.client.comments(videoId)
      this.comments.set(videoId, bundle)
      return bundle
    })()
    this.commentInflight.set(videoId, work)
    try {
      return await work
    } finally {
      this.commentInflight.delete(videoId)
    }
  }

  async search(query: string): Promise<ListState> {
    this.stats.searchLoads += 1
    const page = await this.client.search(query)
    const list = emptyList(`검색 · ${query}`)
    list.items = page.items
    list.continuation = page.continuation
    return list
  }
}

function emptyList(title: string): ListState {
  return {
    title,
    items: [],
    continuation: null,
    selected: 0,
    offset: 0,
    loading: false,
    inflight: null,
  }
}

export function visibleWindow(
  list: ListState,
  rows: number,
): { offset: number; slice: VideoItem[]; selectedInView: number } {
  const height = Math.max(1, rows)
  if (list.selected < list.offset) list.offset = list.selected
  if (list.selected >= list.offset + height) {
    list.offset = list.selected - height + 1
  }
  const slice = list.items.slice(list.offset, list.offset + height)
  return {
    offset: list.offset,
    slice,
    selectedInView: list.selected - list.offset,
  }
}

export async function openCatalog(forceDemo: boolean): Promise<YoutubeCatalog> {
  if (forceDemo) {
    const catalog = new YoutubeCatalog(createDemoClient())
    catalog.source = "demo"
    catalog.status = "예시 피드 · 방향키는 목록만 움직입니다"
    await catalog.ensureFeed()
    return catalog
  }
  try {
    const live = new YoutubeCatalog(createLiveClient())
    live.source = "live"
    await live.ensureFeed()
    if (live.feed.items.length === 0) throw new Error("empty")
    live.status = "인기 급상승 · 방향키로는 불러오지 않습니다"
    return live
  } catch {
    const catalog = new YoutubeCatalog(createDemoClient())
    catalog.source = "demo"
    catalog.status = "유튜브 피드 대신 예시 · 방향키는 목록만 움직입니다"
    await catalog.ensureFeed()
    return catalog
  }
}
