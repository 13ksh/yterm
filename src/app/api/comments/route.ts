import { NextResponse } from "next/server"
import { fetchVideoComments } from "@/lib/fetch-comments"
import { parseVideoId } from "@/lib/video-id"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

type Body = {
  url?: string
  sort?: "popular" | "recent"
  maxComments?: number
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 })
  }

  const videoId = parseVideoId(body.url ?? "")
  if (!videoId) {
    return NextResponse.json(
      { error: "유튜브 영상 주소를 확인해 주세요." },
      { status: 400 },
    )
  }

  const sort = body.sort === "recent" ? "recent" : "popular"
  const maxComments = Math.min(100, Math.max(5, Number(body.maxComments) || 40))

  try {
    const result = await fetchVideoComments({ videoId, sort, maxComments })
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "댓글을 불러오지 못했습니다."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
