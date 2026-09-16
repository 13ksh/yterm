import assert from "node:assert/strict"
import { test } from "node:test"
import { DEMO_COMMENTS, DEMO_TITLE } from "../lib/demo"
import { DEMO_FEED } from "../lib/youtube-catalog"
import { commentLines, renderTui, visibleLineCount } from "./screen"

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
  assert.match(plain, /1 2026/)
  assert.match(plain, /2 테스트/)
  assert.match(plain, /3 비 오는/)
  assert.match(plain, /4 키보드/)
  assert.match(plain, /댓글창/)
  assert.doesNotMatch(plain.split("\n").slice(-6).join("\n"), / 1 /)
})

test("commentLines render the demo tree into the comments window", () => {
  const lines = commentLines(DEMO_COMMENTS, DEMO_TITLE, 40)
  assert.ok(lines.some((line) => line.includes("@hsh")))
  assert.ok(lines.some((line) => line.includes("이거 진짜임")))
})
