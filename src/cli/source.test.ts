import assert from "node:assert/strict"
import { test } from "node:test"
import { isRetryableYtError } from "./source"
import { sanitizeTermSize } from "./vt"
import { copySharedFile } from "./cookies"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

test("Chrome cookie-lock errors are retryable so we can try another browser", () => {
  assert.equal(
    isRetryableYtError(
      "yt-dlp.exe 실패 (1) ERROR: Could not copy Chrome cookie database. See https://github.com/yt-dlp/yt-dlp/issues/7271",
    ),
    true,
  )
  assert.equal(isRetryableYtError("Sign in to confirm you’re not a bot"), true)
  assert.equal(isRetryableYtError("ffmpeg not found"), false)
})

test("Windows buffer height is not used as the visible window", () => {
  const huge = sanitizeTermSize(120, 9000, "win32")
  assert.equal(huge.rows, 24)
  assert.ok(huge.cols <= 160)
  const ok = sanitizeTermSize(100, 30, "win32")
  assert.equal(ok.rows, 30)
  assert.equal(ok.cols, 100)
})

test("copySharedFile writes a readable copy", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "yterm-copy-"))
  const src = path.join(dir, "Cookies")
  const dest = path.join(dir, "out", "Cookies")
  writeFileSync(src, "hello-cookies")
  copySharedFile(src, dest)
  assert.equal(readFileSync(dest, "utf8"), "hello-cookies")
})
