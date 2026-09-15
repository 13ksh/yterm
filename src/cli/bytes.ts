import { Readable } from "node:stream"

export class ByteReader {
  private leftover = Buffer.alloc(0)
  private ended = false
  private error: Error | null = null
  private notify: (() => void) | null = null

  constructor(stream: Readable) {
    stream.on("data", (chunk: Buffer) => {
      this.leftover = Buffer.concat([this.leftover, chunk])
      this.notify?.()
    })
    stream.on("end", () => {
      this.ended = true
      this.notify?.()
    })
    stream.on("error", (err: Error) => {
      this.error = err
      this.notify?.()
    })
  }

  async read(size: number): Promise<Buffer | null> {
    await this.waitUntil(size)
    if (this.error) throw this.error
    if (this.leftover.length >= size) {
      const out = Buffer.from(this.leftover.subarray(0, size))
      this.leftover = Buffer.from(this.leftover.subarray(size))
      return out
    }
    if (this.leftover.length === 0) return null
    const last = this.leftover
    this.leftover = Buffer.alloc(0)
    return last
  }

  private waitUntil(size: number): Promise<void> {
    if (this.leftover.length >= size || this.ended || this.error) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.notify = () => {
        if (this.leftover.length >= size || this.ended || this.error) {
          this.notify = null
          resolve()
        }
      }
      this.notify()
    })
  }
}
