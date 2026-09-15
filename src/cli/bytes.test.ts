import assert from "node:assert/strict"
import { Readable } from "node:stream"
import { test } from "node:test"
import { ByteReader } from "./bytes"

test("ByteReader keeps bytes that arrive between reads", async () => {
  const stream = new Readable({ read() {} })
  const reader = new ByteReader(stream)
  stream.push(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
  await sleep(0)
  const a = await reader.read(3)
  const b = await reader.read(3)
  stream.push(Buffer.from([9]))
  stream.push(null)
  const c = await reader.read(3)
  assert.deepEqual([...a!], [1, 2, 3])
  assert.deepEqual([...b!], [4, 5, 6])
  assert.deepEqual([...c!], [7, 8, 9])
})

test("ByteReader returns null after a clean end", async () => {
  const stream = new Readable({ read() {} })
  const reader = new ByteReader(stream)
  stream.push(null)
  assert.equal(await reader.read(4), null)
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
