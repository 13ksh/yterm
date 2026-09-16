import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

export type CookieArgs = string[]

type BrowserSpec = {
  name: "chrome" | "edge" | "brave" | "firefox"
  userData: string
}

export function copySharedFile(src: string, dest: string): void {
  mkdirSync(path.dirname(dest), { recursive: true })
  try {
    copyFileSync(src, dest)
    return
  } catch {
    /* Chrome/Edge keep an exclusive lock; shared read often still works. */
  }
  const fd = openSync(src, "r")
  try {
    const size = statSync(src).size
    const buf = Buffer.alloc(Math.max(1, size))
    let off = 0
    while (off < size) {
      const n = readSync(fd, buf, off, size - off, off)
      if (n <= 0) break
      off += n
    }
    writeFileSync(dest, buf.subarray(0, off))
  } finally {
    closeSync(fd)
  }
}

function windowsBrowserRoots(): BrowserSpec[] {
  const home = homedir()
  const local = path.join(home, "AppData", "Local")
  return [
    {
      name: "edge",
      userData: path.join(local, "Microsoft", "Edge", "User Data"),
    },
    {
      name: "chrome",
      userData: path.join(local, "Google", "Chrome", "User Data"),
    },
    {
      name: "brave",
      userData: path.join(local, "BraveSoftware", "Brave-Browser", "User Data"),
    },
  ]
}

function cookiePath(profileDir: string): string | null {
  const nested = path.join(profileDir, "Network", "Cookies")
  const legacy = path.join(profileDir, "Cookies")
  if (existsSync(nested)) return nested
  if (existsSync(legacy)) return legacy
  return null
}

function profileDirs(userData: string): string[] {
  const names = ["Default"]
  try {
    for (const dir of readdirSync(userData, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      if (/^Profile \d+$/i.test(dir.name)) names.push(dir.name)
    }
  } catch {
    /* missing */
  }
  return names.map((name) => path.join(userData, name))
}

export function copiedBrowserCookieArgs(): CookieArgs[] {
  if (process.platform !== "win32") return []
  const out: CookieArgs[] = []
  for (const browser of windowsBrowserRoots()) {
    if (!existsSync(browser.userData)) continue
    const localState = path.join(browser.userData, "Local State")
    for (const profileDir of profileDirs(browser.userData)) {
      const cookies = cookiePath(profileDir)
      if (!cookies) continue
      const stamp = `${browser.name}-${path.basename(profileDir)}`.replace(/\s+/g, "")
      const root = path.join(tmpdir(), "yterm-cookies", stamp)
      const destProfile = path.join(root, "Default")
      const destCookies = path.join(destProfile, "Network", "Cookies")
      try {
        if (existsSync(localState)) {
          copySharedFile(localState, path.join(root, "Local State"))
        }
        copySharedFile(cookies, destCookies)
        out.push(["--cookies-from-browser", `${browser.name}:${destProfile}`])
        break
      } catch {
        /* try next profile / browser */
      }
    }
  }
  return out
}
