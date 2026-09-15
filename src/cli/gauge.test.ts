import assert from "node:assert/strict"
import { test } from "node:test"
import {
  clampRatio,
  formatTime,
  percentLabel,
  playheadRatio,
  renderGauge,
  truncateTitle,
} from "./gauge"

test("percent labels are three digits plus %", () => {
  assert.equal(percentLabel(0), "  0%")
  assert.equal(percentLabel(0.5), " 50%")
  assert.equal(percentLabel(1), "100%")
  assert.equal(percentLabel(1.4), "100%")
  assert.equal(percentLabel(-2), "  0%")
})

test("formatTime uses m:ss and h:mm:ss", () => {
  assert.equal(formatTime(0), "0:00")
  assert.equal(formatTime(5), "0:05")
  assert.equal(formatTime(65), "1:05")
  assert.equal(formatTime(3723), "1:02:03")
})

test("playhead ratio follows elapsed / duration", () => {
  assert.equal(playheadRatio(10, 40), 0.25)
  assert.equal(playheadRatio(0, null), 0)
  assert.equal(clampRatio(9), 1)
})

test("gauge bar fills with YouTube-red blocks and a % label", () => {
  const empty = renderGauge({
    ratio: 0,
    elapsed: 0,
    duration: 12,
    width: 40,
  })
  const half = renderGauge({
    ratio: 0.5,
    elapsed: 6,
    duration: 12,
    width: 40,
  })
  const full = renderGauge({
    ratio: 1,
    elapsed: 12,
    duration: 12,
    width: 40,
  })

  assert.match(empty, /0%/)
  assert.match(empty, /0:00 \/ 0:12/)
  assert.match(empty, /\x1b\[38;2;255;0;0m/)
  assert.equal([...empty].filter((ch) => ch === "█").length, 0)
  assert.ok([...empty].filter((ch) => ch === "░").length >= 8)

  assert.match(half, /50%/)
  assert.match(half, /0:06 \/ 0:12/)
  assert.ok([...half].filter((ch) => ch === "█").length > 0)

  assert.match(full, /100%/)
  assert.equal([...full].filter((ch) => ch === "░").length, 0)
  assert.ok([...full].filter((ch) => ch === "█").length >= 8)
})

test("paused gauge appends 일시정지", () => {
  const g = renderGauge({
    ratio: 0.2,
    elapsed: 2,
    duration: 10,
    width: 48,
    paused: true,
  })
  assert.match(g, /20%/)
  assert.match(g, /일시정지/)
})

test("truncateTitle ellipsizes", () => {
  assert.equal(truncateTitle("짧은 제목", 20), "짧은 제목")
  assert.equal(truncateTitle("abcdefghij", 6), "abcde…")
})
