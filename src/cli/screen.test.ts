import assert from "node:assert/strict"
import { test } from "node:test"
import { DEMO_COMMENTS, DEMO_TITLE } from "../lib/demo"
import { DEMO_FEED } from "../lib/youtube-catalog"
import { commentLines, renderTui, visibleLineCount } from "./screen"
import { displayWidth } from "./width"

function plainLines(text: string): string[] {
  return text.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)
}

test("feed shows items 1-4 and a comments pane without overflowing rows", () => {
  const text = renderTui({
    view: "feed",
    list: {
      title: "인기 급상승",
      items: DEMO_FEED.slice(0, 8),
      continuation: null,
      selected: 0,
      offset: 0,
      loading: false,
      inflight: null,
    },
    query: "",
    composing: false,
    comments: [],
    commentTitle: "",
    commentOffset: 0,
    status: "예시 피드",
    source: "demo",
    cols: 72,
    rows: 16,
  })
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "")
  assert.equal(visibleLineCount(text), 16)
  assert.match(plainLines(text)[0] ?? "", /ASCII/)
  assert.match(plain, /1 2026/)
  assert.match(plain, /2 테스트/)
  assert.match(plain, /3 비 오는/)
  assert.match(plain, /4 키보드/)
  assert.match(plain, /댓글창/)
  assert.doesNotMatch(plain.split("\n").slice(-6).join("\n"), / 1 /)
})

test("hangul highlight stays within columns so the header is not clipped", () => {
  const cols = 48
  const rows = 16
  const text = renderTui({
    view: "feed",
    list: {
      title: "인기 급상승",
      items: DEMO_FEED,
      continuation: null,
      selected: 10,
      offset: 0,
      loading: false,
      inflight: null,
    },
    query: "",
    composing: false,
    comments: [],
    commentTitle: "",
    commentOffset: 0,
    status: "CMD UTF-8 설정 팁",
    source: "live",
    cols,
    rows,
  })
  const lines = plainLines(text)
  assert.equal(lines.length, rows)
  assert.match(lines[0] ?? "", /ASCII 유튜브/)
  assert.match(lines[0] ?? "", /LIVE/)
  assert.match(text.replace(/\x1b\[[0-9;]*m/g, ""), /댓글창/)
  for (const line of lines) {
    assert.ok(
      displayWidth(line) <= cols,
      `${JSON.stringify(line)} width=${displayWidth(line)}`,
    )
  }
})

test("commentLines render the demo tree into the comments window", () => {
  const lines = commentLines(DEMO_COMMENTS, DEMO_TITLE, 40)
  assert.ok(lines.some((line) => line.includes("@hsh")))
  assert.ok(lines.some((line) => line.includes("이거 진짜임")))
  for (const line of lines) {
    assert.ok(displayWidth(line) <= 40, line)
  }
})
