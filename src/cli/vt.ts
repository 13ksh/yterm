import { spawnSync } from "node:child_process"

let done = false

export function useAltScreen(): boolean {
  return process.platform !== "win32"
}

export function enableVt(): void {
  if (done) return
  done = true
  if (process.platform !== "win32") return
  try {
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        'Add-Type -Name Vt -Namespace Win -MemberDefinition \'[DllImport("kernel32.dll")]public static extern System.IntPtr GetStdHandle(int n);[DllImport("kernel32.dll")]public static extern bool GetConsoleMode(System.IntPtr h, out uint m);[DllImport("kernel32.dll")]public static extern bool SetConsoleMode(System.IntPtr h, uint m);\'; $h=[Win.Vt]::GetStdHandle(-11); $m=0; [void][Win.Vt]::GetConsoleMode($h,[ref]$m); [void][Win.Vt]::SetConsoleMode($h, $m -bor 4 -bor 8); [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false',
      ],
      { stdio: "ignore", windowsHide: true, timeout: 4000 },
    )
  } catch {
    /* CMD still works with chcp 65001 */
  }
}

export function termSize(cols?: number | null, rows?: number | null): {
  cols: number
  rows: number
} {
  const c = cols ?? process.stdout.columns ?? 80
  const r = rows ?? process.stdout.rows ?? 24
  return {
    cols: Math.max(40, Math.min(c || 80, 200)),
    rows: Math.max(10, Math.min(r || 24, 80)),
  }
}
