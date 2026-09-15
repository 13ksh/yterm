import assert from "node:assert/strict"
import { test } from "node:test"
import { parseVideoId } from "./video-id"

test("parses watch, short, and share URLs", () => {
  assert.equal(
    parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ",
  )
  assert.equal(parseVideoId("https://youtu.be/dQw4w9WgXcQ?t=12"), "dQw4w9WgXcQ")
  assert.equal(
    parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ",
  )
  assert.equal(parseVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ")
})

test("rejects junk", () => {
  assert.equal(parseVideoId(""), null)
  assert.equal(parseVideoId("https://example.com/watch?v=nope"), null)
})
