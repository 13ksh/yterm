import {
  openCatalog,
  type ListState,
  type VideoItem,
  type YoutubeCatalog,
} from "../lib/youtube-catalog"
import type { CliOptions } from "./args"
import { KeyDecoder, isQuit, type Key } from "./keys"
import { play } from "./player"
import { commentLines, renderTui, type TuiModel, type TuiView } from "./screen"
import { enableVt, termSize, useAltScreen } from "./vt"

const ALT_ON = "\x1b[?1049h"
const ALT_OFF = "\x1b[?1049l"
const HIDE = "\x1b[?25l"
const SHOW = "\x1b[?25h"
const HOME = "\x1b[H"
const CLEAR = "\x1b[2J\x1b[3J"

type Session = {
  catalog: YoutubeCatalog
  view: TuiView
  list: ListState
  stack: Array<{ view: TuiView; list: ListState }>
  query: string
  composing: boolean
  comments: TuiModel["comments"]
  commentsVideoId: string | null
  commentTitle: string
  commentOffset: number
  current: VideoItem | null
  status: string
}

export async function runTui(opts: CliOptions): Promise<number> {
  enableVt()
  const catalog = await openCatalog(Boolean(opts.demo))
  const session: Session = {
    catalog,
    view: "feed",
    list: catalog.feed,
    stack: [],
    query: "",
    composing: false,
    comments: [],
    commentsVideoId: null,
    commentTitle: "",
    commentOffset: 0,
    current: catalog.selectedVideo(catalog.feed),
    status: catalog.status,
  }

  const decoder = new KeyDecoder()
  let playHandler: ((key: string) => void) | null = null
  let running = true
  let wake: (() => void) | null = null
  let keyQueue = Promise.resolve()

  const size = () => termSize(opts.cols, opts.rows)

  const redraw = () => {
    const { cols, rows } = size()
    const model: TuiModel = {
      view: session.view,
      list: session.list,
      query: session.query,
      composing: session.composing,
      comments: session.comments,
      commentTitle: session.commentTitle,
      commentOffset: session.commentOffset,
      status: session.status,
      source: catalog.source,
      cols,
      rows,
    }
    process.stdout.write(`${CLEAR}${HOME}${renderTui(model)}`)
  }

  if (opts.snapshot) {
    const { cols, rows } = size()
    process.stdout.write(
      `${renderTui({
        view: session.view,
        list: session.list,
        query: session.query,
        composing: session.composing,
        comments: session.comments,
        commentTitle: session.commentTitle,
        commentOffset: session.commentOffset,
        status: session.status,
        source: catalog.source,
        cols,
        rows,
      })}\n`,
    )
    return 0
  }

  if (!process.stdin.isTTY) {
    process.stderr.write(
      "이 화면은 CMD/터미널에서 실행하세요. 미리보기는 yterm --snapshot\n",
    )
    return 1
  }

  const alt = useAltScreen()
  process.stdout.write(`${alt ? ALT_ON : ""}${HIDE}${CLEAR}`)
  redraw()

  const onData = (chunk: Buffer) => {
    const keys = decoder.push(chunk)
    if (playHandler) {
      for (const key of keys) {
        if (isQuit(key)) playHandler("q")
        else if (key.name === "space") playHandler(" ")
      }
      return
    }
    keyQueue = keyQueue.then(() => handleKeys(keys))
  }

  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on("data", onData)
  }

  const onSig = () => {
    running = false
    playHandler?.("q")
    wake?.()
  }
  process.on("SIGINT", onSig)
  process.on("SIGTERM", onSig)

  async function handleKeys(keys: Key[]): Promise<void> {
    for (const key of keys) {
      await handleKey(key)
    }
    redraw()
    wake?.()
  }

  async function handleKey(key: Key): Promise<void> {
    if (session.composing) {
      if (key.name === "escape") {
        session.composing = false
        session.query = ""
        session.status = "검색 취소"
        return
      }
      if (key.name === "enter") {
        session.composing = false
        const q = session.query.trim()
        if (!q) return
        session.status = `"${q}" 검색 중…`
        redraw()
        try {
          const list = await catalog.search(q)
          session.stack.push({ view: session.view, list: session.list })
          session.view = "search"
          session.list = list
          session.current = catalog.selectedVideo(list)
          session.status =
            list.items.length === 0
              ? "검색 결과 없음"
              : `검색 ${list.items.length}개 · 방향키는 목록만 움직입니다`
        } catch (err) {
          session.status = err instanceof Error ? err.message : String(err)
        }
        return
      }
      if (key.name === "backspace") {
        session.query = session.query.slice(0, -1)
        return
      }
      if (key.name === "char" && key.char && !key.ctrl) {
        session.query += key.char
      }
      return
    }

    if (isQuit(key)) {
      running = false
      return
    }

    if (key.name === "char" && (key.char === "[" || key.char === "]")) {
      session.commentOffset = Math.max(
        0,
        session.commentOffset + (key.char === "]" ? 1 : -1),
      )
      return
    }

    if (key.name === "up" || key.name === "down") {
      const moved = catalog.move(session.list, key.name === "down" ? 1 : -1)
      if (moved) {
        session.current = catalog.selectedVideo(session.list)
        if (session.commentsVideoId !== session.current?.videoId) {
          session.comments = []
          session.commentTitle = ""
          session.commentOffset = 0
        }
        session.status = `${session.current?.title ?? ""}`
        void catalog.maybeLoadMore(session.list).then(() => redraw())
      }
      return
    }

    if (key.name === "left" || (key.name === "char" && key.char === "b")) {
      goBack()
      return
    }

    if (key.name === "right" || (key.name === "char" && key.char === "r")) {
      await openRelated()
      return
    }

    if (key.name === "enter") {
      await playSelected()
      return
    }

    if (key.name === "char" && (key.char === "/" || key.char === "s")) {
      session.composing = true
      session.query = ""
      session.status = "검색어 입력"
      return
    }

    if (key.name === "char" && (key.char === "c" || key.char === "C")) {
      await openComments()
    }
  }

  function goBack() {
    const prev = session.stack.pop()
    if (!prev) {
      session.view = "feed"
      session.list = catalog.feed
      session.current = catalog.selectedVideo(session.list)
      session.status = catalog.status
      return
    }
    session.view = prev.view
    session.list = prev.list
    session.current = catalog.selectedVideo(session.list)
    session.status = prev.list.title
  }

  async function openRelated() {
    const item = session.current ?? catalog.selectedVideo(session.list)
    if (!item) return
    session.status = `추천 불러오는 중 · ${item.title}`
    redraw()
    try {
      const list = await catalog.openRelated(item.videoId)
      session.stack.push({ view: session.view, list: session.list })
      session.view = "related"
      session.list = list
      session.current = catalog.selectedVideo(list)
      session.status = `추천 ${list.items.length}개 · ${item.title}`
    } catch (err) {
      session.status = err instanceof Error ? err.message : String(err)
    }
  }

  async function openComments() {
    const item = session.current ?? catalog.selectedVideo(session.list)
    if (!item) return
    session.status = `댓글창 불러오는 중 · ${item.title}`
    redraw()
    try {
      const bundle = await catalog.openComments(item.videoId)
      session.comments = bundle.comments
      session.commentsVideoId = item.videoId
      session.commentTitle = bundle.title || item.title
      session.commentOffset = 0
      session.current = item
      session.status = `댓글창 ${bundle.comments.length}개 · ${item.title}`
    } catch (err) {
      session.status = err instanceof Error ? err.message : String(err)
    }
  }

  async function playSelected() {
    const item = session.current ?? catalog.selectedVideo(session.list)
    if (!item) return
    session.status = `영상 그리는 중 · ${item.title}`
    redraw()
    let comments: string[] = []
    try {
      const bundle = await catalog.openComments(item.videoId)
      session.comments = bundle.comments
      session.commentsVideoId = item.videoId
      session.commentTitle = bundle.title || item.title
      comments = commentLines(bundle.comments, bundle.title || item.title, 60)
    } catch {
      comments = ["댓글창을 열지 못했습니다"]
    }
    try {
      await play(
        {
          ...opts,
          demo: Boolean(item.demo),
          target: item.demo
            ? null
            : `https://www.youtube.com/watch?v=${item.videoId}`,
          noAlt: true,
        },
        {
          ownedScreen: true,
          comments,
          onKey: (handler) => {
            playHandler = handler
            return () => {
              playHandler = null
            }
          },
        },
      )
      session.status = `재생 끝 · ${item.title}`
    } catch (err) {
      session.status = err instanceof Error ? err.message : String(err)
    }
  }

  try {
    while (running) {
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
    return 0
  } finally {
    process.off("SIGINT", onSig)
    process.off("SIGTERM", onSig)
    process.stdin.off("data", onData)
    try {
      process.stdin.setRawMode(false)
    } catch {
      /* ignore */
    }
    process.stdin.pause()
    process.stdout.write(`${SHOW}${alt ? ALT_OFF : CLEAR}`)
  }
}
