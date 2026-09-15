import assert from "node:assert/strict"
import { test } from "node:test"
import { parseArgs } from "./args"

test("defaults to 8 fps and no target", () => {
  const opts = parseArgs([])
  assert.equal(opts.fps, 8)
  assert.equal(opts.demo, false)
  assert.equal(opts.target, null)
})

test("parses demo, youtube url, and flags", () => {
  const opts = parseArgs([
    "--demo",
    "--fps",
    "8",
    "--cols=40",
    "--rows",
    "16",
    "--frames",
    "3",
    "--no-alt",
  ])
  assert.equal(opts.demo, true)
  assert.equal(opts.fps, 8)
  assert.equal(opts.cols, 40)
  assert.equal(opts.rows, 16)
  assert.equal(opts.frames, 3)
  assert.equal(opts.noAlt, true)
})

test("accepts a youtube url as the target", () => {
  const opts = parseArgs(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"])
  assert.equal(opts.target, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
})

test("rejects unknown flags and double targets", () => {
  assert.throws(() => parseArgs(["--nope"]), /알 수 없는/)
  assert.throws(() => parseArgs(["a.mp4", "b.mp4"]), /하나만/)
})
