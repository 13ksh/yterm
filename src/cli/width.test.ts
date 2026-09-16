import assert from "node:assert/strict"
import { test } from "node:test"
import { clipToWidth, displayWidth, padToWidth } from "./width"

test("hangul syllables occupy two terminal columns", () => {
  assert.equal(displayWidth("a"), 1)
  assert.equal(displayWidth("한"), 2)
  assert.equal(displayWidth("한글"), 4)
  assert.equal(displayWidth("CMD 설정"), 8)
})

test("clipToWidth never exceeds the budget", () => {
  assert.equal(clipToWidth("한글한글한글", 5), "한글…")
  assert.equal(displayWidth(clipToWidth("한글한글한글", 5)), 5)
  assert.equal(clipToWidth("abcdefghij", 6), "abcde…")
})

test("padToWidth fills to exact columns", () => {
  const padded = padToWidth("윈도우터미널", 20)
  assert.equal(displayWidth(padded), 20)
  assert.ok(padded.startsWith("윈도우터미널"))
})
