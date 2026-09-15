export type KeyName =
  | "up"
  | "down"
  | "left"
  | "right"
  | "enter"
  | "space"
  | "escape"
  | "backspace"
  | "tab"
  | "char"

export type Key = {
  name: KeyName
  char?: string
  ctrl?: boolean
}

const WIN_ARROWS: Record<number, KeyName> = {
  0x48: "up",
  0x50: "down",
  0x4b: "left",
  0x4d: "right",
}

export class KeyDecoder {
  private pending: number[] = []

  push(chunk: Buffer | string): Key[] {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk
    const keys: Key[] = []
    for (const byte of bytes) {
      this.pending.push(byte)
      const key = this.consume()
      if (key) keys.push(key)
    }
    if (this.pending.length === 1 && this.pending[0] === 0x1b) {
      this.pending = []
      keys.push({ name: "escape" })
    }
    return keys
  }

  private consume(): Key | null {
    const buf = this.pending
    if (buf.length === 0) return null

    if (buf[0] === 0x03) {
      this.pending = []
      return { name: "char", char: "\u0003", ctrl: true }
    }
    if (buf[0] === 0x0d || buf[0] === 0x0a) {
      buf.shift()
      return { name: "enter" }
    }
    if (buf[0] === 0x09) {
      buf.shift()
      return { name: "tab" }
    }
    if (buf[0] === 0x7f || buf[0] === 0x08) {
      buf.shift()
      return { name: "backspace" }
    }
    if (buf[0] === 0x20) {
      buf.shift()
      return { name: "space" }
    }

    if (buf[0] === 0x1b) {
      if (buf.length === 1) return null
      if (buf[1] === 0x5b || buf[1] === 0x4f) {
        if (buf.length < 3) return null
        const third = buf[2]
        this.pending = buf.slice(3)
        if (third === 0x41) return { name: "up" }
        if (third === 0x42) return { name: "down" }
        if (third === 0x43) return { name: "right" }
        if (third === 0x44) return { name: "left" }
        if (third === 0x5a) return { name: "tab" }
        return null
      }
      this.pending = buf.slice(1)
      return { name: "escape" }
    }

    // Windows CMD: 0xE0/0x00 + scan code
    if (buf[0] === 0xe0 || buf[0] === 0x00) {
      if (buf.length < 2) return null
      const name = WIN_ARROWS[buf[1]]
      this.pending = buf.slice(2)
      if (name) return { name }
      return null
    }

    const first = buf[0]
    if (first < 0x20) {
      buf.shift()
      return { name: "char", char: String.fromCharCode(first), ctrl: true }
    }

    let take = 1
    if ((first & 0xe0) === 0xc0) take = 2
    else if ((first & 0xf0) === 0xe0) take = 3
    else if ((first & 0xf8) === 0xf0) take = 4
    if (buf.length < take) return null
    const slice = buf.splice(0, take)
    return { name: "char", char: Buffer.from(slice).toString("utf8") }
  }
}

export function isQuit(key: Key): boolean {
  return (
    (key.name === "char" && (key.char === "q" || key.char === "Q" || key.char === "\u0003")) ||
    Boolean(key.ctrl && key.char === "\u0003")
  )
}
