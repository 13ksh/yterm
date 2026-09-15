import {
  visibleWindow,
  type ListState,
  type VideoItem,
} from "../lib/youtube-catalog"
import { truncateTitle } from "./gauge"
import { buildForest, renderTree, type FlatComment } from "../lib/tree"

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

export function renderTui(model: TuiModel): string {
  const cols = Math.max(40, model.cols)
  const rows = Math.max(12, model.rows)
  const header = renderHeader(model, cols)
  const footer = renderFooter(model, cols)
  const bodyRows = rows - 4
  const body =
    model.view === "comments"
      ? renderComments(model, cols, bodyRows)
      : renderList(model.list, cols, bodyRows, model.composing ? model.query : null)
  const status = padLine(`${DIM}${truncateTitle(model.status, cols)}${RESET}`, cols)
  const lines = [header, body, status, footer]
  return lines.join("\n")
}

function renderHeader(model: TuiModel, cols: number): string {
  const tag = model.source === "demo" ? "DEMO" : "LIVE"
  const title =
    model.view === "feed"
      ? "피드"
      : model.view === "related"
        ? "추천"
        : model.view === "comments"
          ? "댓글"
          : model.composing
            ? `검색 입력: ${model.query}_`
            : model.list.title
  const left = `${RED}▶${RESET} ${WHITE}ASCII 유튜브${RESET}  ${DIM}${tag}${RESET}  ${title}`
  return padLine(left, cols)
}

function renderFooter(model: TuiModel, cols: number): string {
  const text =
    model.composing
      ? "Enter 검색  ·  Esc 취소"
      : model.view === "comments"
        ? "↑↓ 스크롤  ·  ← 뒤로  ·  Enter 재생  ·  q 종료"
        : "↑↓ 이동  ·  Enter 재생  ·  → 추천  ·  c 댓글  ·  / 검색  ·  ← 뒤로  ·  q 종료"
  return padLine(`${DIM}${truncateTitle(text, cols)}${RESET}`, cols)
}

function renderList(
  list: ListState,
  cols: number,
  rows: number,
  composingQuery: string | null,
): string {
  if (list.loading && list.items.length === 0) {
    return center("불러오는 중… 방향키로는 요청하지 않습니다", cols, rows)
  }
  if (list.items.length === 0) {
    const empty =
      composingQuery != null && composingQuery.length === 0
        ? "검색어를 입력하세요"
        : "목록이 비었습니다"
    return center(empty, cols, rows)
  }
  const { slice, selectedInView, offset } = visibleWindow(list, rows)
  const lines = slice.map((item, i) =>
    renderRow(item, cols, i === selectedInView, offset + i + 1),
  )
  while (lines.length < rows) lines.push(" ".repeat(cols))
  return lines.join("\n")
}

function renderRow(
  item: VideoItem,
  cols: number,
  selected: boolean,
  index: number,
): string {
  const marker = selected ? `${RED}▶${RESET}` : " "
  const num = String(index).padStart(2, " ")
  const dur = item.duration ? ` ${item.duration}` : ""
  const channel = item.channel ? `  ${item.channel}` : ""
  const main = `${marker} ${num} ${item.title}${dur}`
  const rest = cols - visibleLen(main) - visibleLen(channel)
  const title = rest < 0 ? truncateAnsi(main, cols) : main + " ".repeat(rest) + DIM + channel + RESET
  if (selected) return `${HILITE_BG}${HILITE_FG}${stripForHilite(title, cols)}${RESET}`
  return padLine(title, cols)
}

function renderComments(model: TuiModel, cols: number, rows: number): string {
  if (model.comments.length === 0) {
    return center("댓글이 없거나 아직 불러오지 않았습니다", cols, rows)
  }
  const forest = buildForest(model.comments, true)
  const tree = renderTree(model.commentTitle || "댓글", forest, {
    nestMentions: true,
    showLikes: true,
  }).split("\n")
  const maxOffset = Math.max(0, tree.length - rows)
  const offset = Math.min(model.commentOffset, maxOffset)
  const slice = tree.slice(offset, offset + rows).map((line) =>
    padLine(`${WHITE}${truncateTitle(line, cols)}${RESET}`, cols),
  )
  while (slice.length < rows) slice.push(" ".repeat(cols))
  return slice.join("\n")
}

function center(text: string, cols: number, rows: number): string {
  const line = padLine(`${DIM}${truncateTitle(text, cols)}${RESET}`, cols)
  const out: string[] = []
  const mid = Math.floor(rows / 2)
  for (let i = 0; i < rows; i++) out.push(i === mid ? line : " ".repeat(cols))
  return out.join("\n")
}

function visibleLen(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length
}

function padLine(text: string, cols: number): string {
  const len = visibleLen(text)
  if (len >= cols) return truncateAnsi(text, cols)
  return text + " ".repeat(cols - len)
}

function truncateAnsi(text: string, cols: number): string {
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "")
  if (plain.length <= cols) return text + RESET
  return `${truncateTitle(plain, cols)}${RESET}`
}

function stripForHilite(text: string, cols: number): string {
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "")
  return truncateTitle(plain, cols).padEnd(cols, " ")
}
