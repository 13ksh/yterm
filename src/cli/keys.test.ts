import assert from "node:assert/strict"
import { test } from "node:test"
import { KeyDecoder } from "./keys"

test("decodes VT arrows and Windows CMD scan codes", () => {
  const vt = new KeyDecoder()
  assert.deepEqual(
    vt.push(Buffer.from([0x1b, 0x5b, 0x41])).map((k) => k.name),
    ["up"],
  )
  assert.deepEqual(
    vt.push(Buffer.from([0x1b, 0x5b, 0x42, 0x1b, 0x5b, 0x43, 0x1b, 0x5b, 0x44])).map(
      (k) => k.name,
    ),
    ["down", "right", "left"],
  )

  const win = new KeyDecoder()
  assert.equal(win.push(Buffer.from([0xe0, 0x48]))[0]?.name, "up")
  assert.equal(win.push(Buffer.from([0xe0, 0x50]))[0]?.name, "down")
  assert.equal(win.push(Buffer.from([0x00, 0x4d]))[0]?.name, "right")
})

test("enter space q and korean characters", () => {
  const d = new KeyDecoder()
  assert.equal(d.push("\r")[0]?.name, "enter")
  assert.equal(d.push(" ")[0]?.name, "space")
  const q = d.push("q")[0]
  assert.equal(q?.name, "char")
  assert.equal(q?.char, "q")
  const ko = d.push("댓")[0]
  assert.equal(ko?.char, "댓")
})
