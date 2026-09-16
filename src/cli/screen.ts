import { visibleWindow, type ListState } from "../lib/youtube-catalog"
import { truncateTitle } from "./gauge"
import { buildForest, renderTree, type FlatComment } from "../lib/tree"
import { clipToWidth, displayWidth, padToWidth, stripAnsi } from "./width"

const RESET = "\x1b[0m"
const RED = "\x1b[38;2;255;0;0m"
const WHITE = "\x1b[38;2;241;241;241m"
const DIM = "\x1b[38;2;140;140;140m"
const HILITE_BG = "\x1b[48;2;40;0;0m"
const HILITE_FG = "\x1b[38;2;255;255;255m"

export type TuiView = "feed" | "related" | "comments" | "search"

export type TuiModel = {
  view: TuiView
  list: ListState
  query: string
  composing: boolean
  comments: FlatComment[]
  commentTitle: string
  commentOffset: number
  status: string
  source: "live" | "demo"
  cols: number
  rows: number
}

export function visibleLineCount(text: string): number {
  if (!text) return 0
  return text.split(/\r?\n/).length
}

export function clampScreen(lines: string[], rows: number, cols: number): string {
  // Leave one column on Windows so a full-width line cannot auto-wrap.
  const fit = process.platform === "win32" ? Math.max(1, cols - 1) : cols
  const out: string[] = []
  for (const line of lines) {
    if (out.length >= rows) break
    out.push(padLine(line, fit))
  }
  while (out.length < rows) out.push(padToWidth("", fit))
  const joiner = process.platform === "win32" ? "\r\n" : "\n"
  return out.slice(0, rows).join(joiner)
}

export function commentLines(
  comments: FlatComment[],
  title: string,
  width: number,
): string[] {
  if (comments.length === 0) {
    return ["c 키 = 이 영상 댓글창", "방향키로는 댓글을 안 불러옵니다"]
  }
  const forest = buildForest(comments, true)
  return renderTree(title || "댓글", forest, {
    nestMentions: true,
    showLikes: true,
  })
    .split("\n")
    .map((line) => clipToWidth(line, width))
}

export function renderTui(model: TuiModel): string {
  const cols = Math.max(40, model.cols)
  const rows = Math.max(10, model.rows)
  const header = renderHeader(model, cols)
  const footer = renderFooter(model, cols)
  const status = `${DIM}${truncateTitle(model.status, cols)}${RESET}`
  const commentH = Math.max(4, Math.min(8, Math.floor(rows * 0.32)))
  const listH = Math.max(4, rows - commentH - 3)
  const list = renderListLines(
    model.list,
    cols,
    listH,
    model.composing ? model.query : null,
  )
  const cWidth = Math.max(16, cols - 2)
  const allComments = commentLines(model.comments, model.commentTitle, cWidth)
  const maxOff = Math.max(0, allComments.length - (commentH - 1))
  const off = Math.min(Math.max(0, model.commentOffset), maxOff)
  const cHead = `${RED}댓글창${RESET} ${DIM}${model.comments.length ? `${model.comments.length}개` : "비어 있음 · c"}${RESET}`
  const cBody = allComments.slice(off, off + commentH - 1)
  const commentsBlock = [cHead, ...cBody]
  while (commentsBlock.length < commentH) commentsBlock.push("")

  const lines = [header, ...list, ...commentsBlock, status, footer]
  return clampScreen(lines, rows, cols)
}

function renderHeader(model: TuiModel, cols: number): string {
  const tag = model.source === "demo" ? "DEMO" : "LIVE"
  const title =
    model.view === "feed"
      ? "피드"
      : model.view === "related"
        ? "추천"
        : model.view === "search"
          ? model.composing
            ? `검색: ${model.query}_`
            : model.list.title
          : model.list.title
  return clipToWidth(
    `${RED}▶${RESET} ${WHITE}ASCII 유튜브${RESET}  ${DIM}${tag}${RESET}  ${title}`,
    cols,
  )
}

function renderFooter(model: TuiModel, cols: number): string {
  const text = model.composing
    ? "Enter 검색  ·  Esc 취소"
    : "↑↓ 영상  ·  Enter 재생  ·  c 댓글창  ·  [ ] 댓글스크롤  ·  → 추천  ·  q 종료"
  return `${DIM}${truncateTitle(text, cols)}${RESET}`
}

function renderListLines(
  list: ListState,
  cols: number,
  rows: number,
  composingQuery: string | null,
): string[] {
  if (list.loading && list.items.length === 0) {
    return padBlock(["불러오는 중…"], cols, rows)
  }
  if (list.items.length === 0) {
    const empty =
      composingQuery != null && composingQuery.length === 0
        ? "검색어를 입력하세요"
        : "목록이 비었습니다"
    return padBlock([empty], cols, rows)
  }
  const { slice, selectedInView, offset } = visibleWindow(list, rows)
  const lines = slice.map((item, i) =>
    renderRow(item, cols, i === selectedInView, offset + i + 1),
  )
  return padBlock(lines, cols, rows)
}

function renderRow(
  item: { title: string; channel: string; duration: string },
  cols: number,
  selected: boolean,
  index: number,
): string {
  const marker = selected ? "▶" : " "
  const num = String(index).padStart(2, " ")
  const dur = item.duration ? ` ${item.duration}` : ""
  const channel = item.channel ? `  ${item.channel}` : ""
  const plain = `${marker} ${num} ${item.title}${dur}${channel}`
  const clipped = clipToWidth(plain, cols)
  if (selected) {
    return `${HILITE_BG}${HILITE_FG}${padToWidth(clipped, cols)}${RESET}`
  }
  return `${WHITE}${clipped}${RESET}`
}

function padBlock(lines: string[], cols: number, rows: number): string[] {
  const out = lines.slice(0, rows)
  while (out.length < rows) out.push("")
  return out.slice(0, rows)
}

export function visibleLen(text: string): number {
  return displayWidth(text)
}

function padLine(text: string, cols: number): string {
  const plain = stripAnsi(text)
  const width = displayWidth(plain)
  if (width === cols) return text
  if (width > cols) {
    return `${clipToWidth(plain, cols)}${RESET}`
  }
  return text + " ".repeat(cols - width)
}
