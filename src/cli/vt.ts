import { spawnSync } from "node:child_process"

let done = false
let winSize: { cols: number; rows: number } | null = null

export function useAltScreen(): boolean {
  return true
}

const SIZE_PS = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class YtermCon {
  [StructLayout(LayoutKind.Sequential)] public struct COORD { public short X; public short Y; }
  [StructLayout(LayoutKind.Sequential)] public struct SMALL_RECT { public short Left; public short Top; public short Right; public short Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct CONSOLE_SCREEN_BUFFER_INFO {
    public COORD dwSize; public COORD dwCursorPosition; public short wAttributes;
    public SMALL_RECT srWindow; public COORD dwMaximumWindowSize;
  }
  [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
  [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m);
  [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);
  [DllImport("kernel32.dll")] public static extern bool GetConsoleScreenBufferInfo(IntPtr h, out CONSOLE_SCREEN_BUFFER_INFO i);
}
"@
$h = [YtermCon]::GetStdHandle(-11)
$m = 0
[void][YtermCon]::GetConsoleMode($h, [ref]$m)
[void][YtermCon]::SetConsoleMode($h, $m -bor 4 -bor 8)
$i = New-Object YtermCon+CONSOLE_SCREEN_BUFFER_INFO
[void][YtermCon]::GetConsoleScreenBufferInfo($h, [ref]$i)
$c = [int]$i.srWindow.Right - [int]$i.srWindow.Left + 1
$r = [int]$i.srWindow.Bottom - [int]$i.srWindow.Top + 1
Write-Output "$c $r"
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}
`

export function enableVt(): void {
  if (done) return
  done = true
  if (process.platform !== "win32") return
  try {
    const result = spawnSync("powershell", ["-NoProfile", "-Command", SIZE_PS], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    })
    const match = String(result.stdout ?? "").match(/(\d+)\s+(\d+)/)
    if (match) {
      const cols = Number(match[1])
      const rows = Number(match[2])
      if (cols >= 40 && cols <= 200 && rows >= 10 && rows <= 60) {
        winSize = { cols, rows }
      }
    }
  } catch {
    /* CMD still works with chcp 65001 */
  }
  try {
    process.stdout.on("resize", () => {
      winSize = null
    })
  } catch {
    /* ignore */
  }
}

export function sanitizeTermSize(
  cols: number,
  rows: number,
  platform = process.platform,
): { cols: number; rows: number } {
  let c = cols
  let r = rows
  if (platform === "win32") {
    // conhost buffer is often 120x9000; never paint that many rows
    if (r > 50) r = 24
    if (c > 160) c = 80
  }
  return {
    cols: Math.max(40, Math.min(c || 80, 160)),
    rows: Math.max(10, Math.min(r || 24, 50)),
  }
}

export function termSize(cols?: number | null, rows?: number | null): {
  cols: number
  rows: number
} {
  if (cols != null && rows != null) return sanitizeTermSize(cols, rows)
  if (process.platform === "win32") {
    const fromWin = winSize ?? readStdoutIfSane()
    return sanitizeTermSize(fromWin?.cols ?? 80, fromWin?.rows ?? 24)
  }
  return sanitizeTermSize(process.stdout.columns || 80, process.stdout.rows || 24)
}

function readStdoutIfSane(): { cols: number; rows: number } | null {
  const c = process.stdout.columns
  const r = process.stdout.rows
  if (!c || !r) return null
  if (r < 10 || r > 50) return null
  if (c < 40 || c > 160) return null
  return { cols: c, rows: r }
}
