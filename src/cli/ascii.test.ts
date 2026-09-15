import assert from "node:assert/strict"
import { test } from "node:test"
import { fitCanvas, frameByteSize, pixelAt, renderAscii } from "./ascii"

test("fitCanvas keeps even pixel height and overlay rows", () => {
  const size = fitCanvas(80, 24, 3)
  assert.equal(size.width, 80)
  assert.equal(size.height, 42)
  assert.equal(size.height % 2, 0)
})

test("frameByteSize is width * height * 3", () => {
  assert.equal(frameByteSize(4, 2), 24)
})

test("two-row RGB becomes one truecolor ▀ line", () => {
  const width = 2
  const height = 2
  const rgb = Buffer.from([
    255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0,
  ])
  assert.deepEqual(pixelAt(rgb, width, height, 0, 0), [255, 0, 0])
  assert.deepEqual(pixelAt(rgb, width, height, 1, 1), [255, 255, 0])

  const art = renderAscii(rgb, width, height)
  assert.equal(art.split("\n").length, 1)
  assert.equal([...art].filter((ch) => ch === "▀").length, 2)
  assert.match(art, /\x1b\[38;2;255;0;0m/)
  assert.match(art, /\x1b\[48;2;0;0;255m/)
  assert.match(art, /\x1b\[38;2;0;255;0m/)
  assert.match(art, /\x1b\[48;2;255;255;0m/)
  assert.match(art, /\x1b\[0m$/)
})

test("odd height pads the last row with black", () => {
  const rgb = Buffer.from([10, 20, 30, 40, 50, 60])
  const art = renderAscii(rgb, 2, 1)
  assert.equal([...art].filter((ch) => ch === "▀").length, 2)
  assert.match(art, /\x1b\[48;2;0;0;0m/)
})
