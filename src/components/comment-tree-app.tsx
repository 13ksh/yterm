"use client"

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ListTreeIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TreeView } from "@/components/tree-view"
import { DEMO_COMMENTS, DEMO_TITLE } from "@/lib/demo"
import {
  buildForest,
  countNodes,
  renderTree,
  type FlatComment,
} from "@/lib/tree"
import { parseVideoId } from "@/lib/video-id"
import { cn } from "@/lib/utils"

type SortMode = "popular" | "recent"
type Source = "demo" | "youtube"

type LoadedVideo = {
  source: Source
  title: string
  channel: string
  thumbnailUrl: string
  comments: FlatComment[]
  videoId?: string
}

const DEMO_VIDEO: LoadedVideo = {
  source: "demo",
  title: DEMO_TITLE,
  channel: "예시 댓글",
  thumbnailUrl: "",
  comments: DEMO_COMMENTS,
}

function ToggleChip({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className="flex h-8 items-center gap-2 rounded-lg border border-white/10 px-2.5 text-sm text-zinc-300 hover:bg-white/5"
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-3.5 w-6 shrink-0 rounded-full border border-transparent transition-colors",
          pressed ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-2.5 rounded-full bg-background transition-transform",
            pressed ? "translate-x-3" : "translate-x-0.5",
          )}
        />
      </span>
      {children}
    </button>
  )
}

export function CommentTreeApp() {
  const [url, setUrl] = useState("")
  const [sort, setSort] = useState<SortMode>("popular")
  const [nestMentions, setNestMentions] = useState(true)
  const [showLikes, setShowLikes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [video, setVideo] = useState<LoadedVideo>(DEMO_VIDEO)
  const urlRef = useRef<HTMLInputElement>(null)
  const loadingRef = useRef(false)

  const forest = useMemo(
    () => buildForest(video.comments, nestMentions),
    [video.comments, nestMentions],
  )
  const treeText = useMemo(
    () =>
      renderTree(video.title, forest, {
        nestMentions,
        showLikes,
      }),
    [forest, nestMentions, showLikes, video.title],
  )
  const total = countNodes(forest)

  async function loadComments(nextUrl: string) {
    const videoId = parseVideoId(nextUrl)
    if (!videoId) {
      setError("유튜브 영상 주소를 붙여 넣어 주세요.")
      toast.error("유튜브 영상 주소를 붙여 넣어 주세요.")
      return
    }
    if (loadingRef.current) return

    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: nextUrl,
          sort,
        }),
        signal: AbortSignal.timeout(295_000),
      })
      const data = (await response.json()) as LoadedVideo & { error?: string }
      if (!response.ok) {
        throw new Error(data.error || "댓글을 불러오지 못했습니다.")
      }
      setVideo({
        source: "youtube",
        title: data.title,
        channel: data.channel,
        thumbnailUrl: data.thumbnailUrl,
        comments: data.comments,
        videoId,
      })
      toast.success(`댓글 ${data.comments.length}개를 불러왔습니다.`)
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "불러오기가 너무 오래 걸렸습니다. 다시 시도해 주세요."
          : err instanceof Error
            ? err.message
            : "불러오기에 실패했습니다."
      setError(message)
      toast.error(message)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const typed = new FormData(event.currentTarget).get("url")
    const nextUrl = String(typed ?? urlRef.current?.value ?? url)
    setUrl(nextUrl)
    void loadComments(nextUrl)
  }

  function loadDemo() {
    setVideo(DEMO_VIDEO)
    setError(null)
    setUrl("")
    toast.message("예시 트리를 열었습니다.")
  }

  async function copyTree() {
    try {
      await navigator.clipboard.writeText(treeText)
      setCopied(true)
      toast.success("트리를 복사했습니다.")
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error("복사에 실패했습니다. 텍스트를 직접 선택해 주세요.")
    }
  }

  function downloadTree() {
    const blob = new Blob([treeText], { type: "text/plain;charset=utf-8" })
    const href = URL.createObjectURL(blob)
    const safeName = video.title.replace(/[\\/:*?"<>|]/g, " ").slice(0, 60).trim()
    const link = document.createElement("a")
    link.href = href
    link.download = `${safeName || "댓글나무"}.txt`
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-rose-300">
          <ListTreeIcon className="size-5" />
          <p className="text-sm font-medium tracking-wide">댓글나무</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              유튜브 댓글을 트리로
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400 sm:text-base">
              영상 주소를 넣으면 댓글과 대댓글을{" "}
              <span className="font-mono text-zinc-200">├─ @닉네임</span> 형태로
              정리합니다. @멘션은 한 단계 더 안으로 묶습니다.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={loadDemo}>
            <SparklesIcon data-icon="inline-start" />
            예시 보기
          </Button>
        </div>
      </header>

      <div className="rounded-2xl border border-white/10 bg-card/80 p-3 shadow-sm backdrop-blur sm:p-4">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onFormSubmit}>
          <input
            ref={urlRef}
            name="url"
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            aria-label="유튜브 영상 주소"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-black/20 px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="submit"
            disabled={loading}
            className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}
          >
            {loading ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : (
              <ListTreeIcon data-icon="inline-start" />
            )}
            {loading ? "모두 불러오는 중" : "트리 만들기"}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={sort}
            onValueChange={(value) => {
              if (value === "popular" || value === "recent") setSort(value)
            }}
          >
            <SelectTrigger className="h-8 w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              <SelectItem value="popular">인기 댓글</SelectItem>
              <SelectItem value="recent">최신 댓글</SelectItem>
            </SelectContent>
          </Select>

          <ToggleChip
            pressed={nestMentions}
            onToggle={() => setNestMentions((value) => !value)}
          >
            @멘션으로 묶기
          </ToggleChip>
          <ToggleChip
            pressed={showLikes}
            onToggle={() => setShowLikes((value) => !value)}
          >
            좋아요 표시
          </ToggleChip>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-amber-200/90" role="status">
          댓글을 모두 읽는 중… 댓글이 많으면 조금 걸립니다.
        </p>
      ) : null}

      <section
        className="overflow-hidden rounded-2xl border border-white/10 bg-[#12100e] shadow-[0_20px_80px_-40px_rgba(0,0,0,0.8)]"
        data-show-likes={showLikes ? "true" : "false"}
        data-nest-mentions={nestMentions ? "true" : "false"}
      >
        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {video.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.thumbnailUrl}
                alt=""
                className="size-10 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/5 text-rose-300">
                <ListTreeIcon className="size-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {video.title}
                </p>
                <Badge variant="outline">
                  {video.source === "demo" ? "예시" : "유튜브"}
                </Badge>
              </div>
              <p className="truncate text-xs text-zinc-500">
                {video.channel ? `${video.channel} · ` : ""}댓글 {forest.length}개
                {total !== forest.length ? ` · 대댓글 포함 ${total}` : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copyTree}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "복사됨" : "복사"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadTree}>
              <DownloadIcon />
              .txt
            </Button>
          </div>
        </div>

        {forest.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-zinc-500">
            표시할 댓글이 없습니다.
          </div>
        ) : (
          <TreeView text={treeText} />
        )}
      </section>

      <p className="text-center text-xs leading-5 text-zinc-500">
        댓글은 불러올 때만 읽고, 서버에 저장하지 않습니다. 유튜브가 요청을 막으면
        예시 트리로 형식을 확인할 수 있습니다. CMD 피드는{" "}
        <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[11px] text-zinc-300">
          yterm --demo
        </code>
        {" "}
        (방향키는 목록만, Enter 재생).
      </p>
    </div>
  )
}
