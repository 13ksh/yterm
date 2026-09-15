const ID = /^[A-Za-z0-9_-]{11}$/

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (ID.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    const fromQuery = url.searchParams.get("v")
    if (fromQuery && ID.test(fromQuery)) return fromQuery

    const host = url.hostname.replace(/^www\./, "")
    const parts = url.pathname.split("/").filter(Boolean)

    if (host === "youtu.be" && parts[0] && ID.test(parts[0])) {
      return parts[0]
    }

    if (
      (host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtube-nocookie.com") &&
      parts.length >= 2 &&
      ["embed", "shorts", "live", "v"].includes(parts[0]) &&
      ID.test(parts[1])
    ) {
      return parts[1]
    }
  } catch {
    const match = trimmed.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/,
    )
    if (match) return match[1]
  }

  return null
}
