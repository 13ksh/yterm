import assert from "node:assert/strict"
import { test } from "node:test"
import { DEMO_COMMENTS } from "./demo"
import {
  DEMO_FEED,
  YoutubeCatalog,
  collectVideos,
  createDemoClient,
  openCatalog,
  visibleWindow,
  type CatalogClient,
  type ListPage,
  type VideoItem,
} from "./youtube-catalog"
import { itemsFromYtDump } from "../cli/source"

test("collectVideos reads videoRenderer and skips duplicates", () => {
  const data = {
    contents: [
      {
        videoRenderer: {
          videoId: "abcdefghijk",
          title: { runs: [{ text: "첫 영상" }] },
          shortBylineText: { runs: [{ text: "채널A" }] },
          shortViewCountText: { simpleText: "조회수 1만회" },
          publishedTimeText: { simpleText: "1일 전" },
        },
      },
      {
        compactVideoRenderer: {
          videoId: "abcdefghijk",
          title: { simpleText: "중복" },
        },
      },
      {
        lockupViewModel: {
          contentId: "ABCDEFGHIJK",
          metadata: {
            lockupMetadataViewModel: {
              title: { content: "락업 영상" },
            },
          },
        },
      },
    ],
  }
  const items = collectVideos(data)
  assert.equal(items.length, 2)
  assert.equal(items[0].title, "첫 영상")
  assert.equal(items[0].channel, "채널A")
  assert.equal(items[1].title, "락업 영상")
})

test("arrow movement does not hit the network", async () => {
  const calls = { more: 0, related: 0, comments: 0, feed: 0 }
  const client: CatalogClient = {
    async trending(): Promise<ListPage> {
      calls.feed += 1
      return { items: DEMO_FEED.slice(0, 8), continuation: "demo:8" }
    },
    async more(): Promise<ListPage> {
      calls.more += 1
      return { items: DEMO_FEED.slice(8), continuation: null }
    },
    async related(): Promise<ListPage> {
      calls.related += 1
      return { items: DEMO_FEED.slice(0, 3), continuation: null }
    },
    async search(): Promise<ListPage> {
      return { items: [], continuation: null }
    },
    async comments() {
      calls.comments += 1
      return { title: "t", channel: "c", comments: DEMO_COMMENTS }
    },
  }

  const catalog = new YoutubeCatalog(client)
  await catalog.ensureFeed()
  assert.equal(calls.feed, 1)
  for (let i = 0; i < 4; i++) catalog.move(catalog.feed, 1)
  await catalog.maybeLoadMore(catalog.feed)
  assert.equal(calls.more, 0, "가운데 있으면 다음 페이지를 치지 않음")
  assert.equal(calls.related, 0)
  assert.equal(calls.comments, 0)
  assert.equal(catalog.stats.relatedLoads, 0)

  catalog.feed.selected = catalog.feed.items.length - 1
  await catalog.maybeLoadMore(catalog.feed)
  assert.equal(calls.more, 1)
  await catalog.maybeLoadMore(catalog.feed)
  assert.equal(calls.more, 1, "continuation 없으면 다시 안 침")

  const id = catalog.feed.items[0].videoId
  await catalog.openRelated(id)
  await catalog.openRelated(id)
  assert.equal(calls.related, 1)
  await catalog.openComments(id)
  await catalog.openComments(id)
  assert.equal(calls.comments, 1)
})

test("visible window follows the cursor without extra fetches", () => {
  const catalog = new YoutubeCatalog(createDemoClient())
  catalog.feed.items = DEMO_FEED.slice(0, 8) as VideoItem[]
  catalog.feed.selected = 6
  const view = visibleWindow(catalog.feed, 5)
  assert.equal(view.slice.length, 5)
  assert.ok(view.slice.some((item) => item.videoId === catalog.feed.items[6].videoId))
})

test("openCatalog(--demo) is the only fake feed", async () => {
  const catalog = await openCatalog(true)
  assert.equal(catalog.source, "demo")
  assert.ok(catalog.feed.items.every((item) => item.demo))
  assert.match(catalog.status, /실제 유튜브가 아닙니다/)
})

test("itemsFromYtDump reads real video ids from yt-dlp JSON", () => {
  const items = itemsFromYtDump({
    entries: [
      {
        id: "dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        uploader: "Rick Astley",
        duration: 213,
        view_count: 1600000000,
      },
      { id: "short", title: "skip" },
      {
        id: "abcdefghijk",
        title: "[Deleted video]",
      },
    ],
    related_videos: [
      {
        id: "AAAAAAAAAAA",
        title: "Related clip",
        uploader: "Other",
        duration: 12,
      },
    ],
  })
  assert.equal(items.length, 2)
  assert.equal(items[0].videoId, "dQw4w9WgXcQ")
  assert.equal(items[0].duration, "3:33")
  assert.equal(items[1].videoId, "AAAAAAAAAAA")
})

