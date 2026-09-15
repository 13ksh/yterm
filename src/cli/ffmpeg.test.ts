import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { renderAscii } from "./ascii"
import { demoSource, ffmpegRawArgs } from "./source"

test("demo ffmpeg args use lavfi testsrc2 and 8fps raw rgb24", () => {
  const source = demoSource(8)
  const args = ffmpegRawArgs(source, 40, 20, 8)
  assert.ok(args.includes("-f"))
  assert.ok(args.includes("lavfi"))
  assert.ok(source.input.startsWith("testsrc2="))
  assert.match(args.join(" "), /fps=8/)
  assert.equal(args.at(-1), "pipe:1")
  assert.ok(args.includes("rgb24"))
})

test("ffmpeg color bar frame renders as truecolor half-blocks", () => {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=6x4:d=1",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { encoding: "buffer", maxBuffer: 1024 * 1024 },
  )
  assert.equal(result.status, 0, result.stderr.toString())
  assert.ok(result.stdout.length === 6 * 4 * 3)
  const r = result.stdout[0]
  const g = result.stdout[1]
  const b = result.stdout[2]
  assert.ok(r > 240 && g < 8 && b < 8, `expected red-ish pixel, got ${r},${g},${b}`)
  const art = renderAscii(result.stdout, 6, 4)
  assert.equal(art.split("\n").length, 2)
  assert.equal([...art].filter((ch) => ch === "▀").length, 12)
  assert.match(art, new RegExp(`\\x1b\\[38;2;${r};${g};${b}m`))
  assert.match(art, new RegExp(`\\x1b\\[48;2;${r};${g};${b}m`))
})
