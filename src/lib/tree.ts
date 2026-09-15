export type FlatComment = {
  id: string
  parentId: string | null
  author: string
  text: string
  likeCount: number
  likeLabel?: string
  publishedTime?: string
}

export type CommentNode = FlatComment & {
  replies: CommentNode[]
}

export type TreeOptions = {
  nestMentions: boolean
  showLikes: boolean
}

export function sanitizeText(text: string): string {
  return text
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function toNode(comment: FlatComment): CommentNode {
  return { ...comment, replies: [] }
}

function findMentionParent(
  text: string,
  thread: CommentNode[],
): { parent: CommentNode; rest: string } | null {
  const trimmed = sanitizeText(text)
  if (!trimmed.startsWith("@")) return null

  let best: {
    parent: CommentNode
    rest: string
    len: number
    recency: number
  } | null = null

  for (let i = 0; i < thread.length; i++) {
    const author = thread[i].author
    if (!author) continue
    const needle = `@${author}`
    if (!trimmed.toLowerCase().startsWith(needle.toLowerCase())) continue
    const after = trimmed.slice(needle.length)
    if (after.length > 0 && !/^[\s.,!?;:~]/.test(after)) continue
    const len = author.length
    if (!best || len > best.len || (len === best.len && i > best.recency)) {
      best = { parent: thread[i], rest: after.trimStart(), len, recency: i }
    }
  }

  return best
}

function nestByMentions(parent: CommentNode, replies: FlatComment[]) {
  const thread: CommentNode[] = [parent]
  for (const reply of replies) {
    const node = toNode(reply)
    const hit = findMentionParent(node.text, thread)
    const target = hit?.parent ?? parent
    if (hit) node.text = hit.rest
    target.replies.push(node)
    thread.push(node)
  }
}

export function buildForest(
  comments: FlatComment[],
  nestMentions: boolean,
): CommentNode[] {
  const tops = comments.filter((comment) => !comment.parentId)
  const replies = new Map<string, FlatComment[]>()

  for (const comment of comments) {
    if (!comment.parentId) continue
    const list = replies.get(comment.parentId) ?? []
    list.push(comment)
    replies.set(comment.parentId, list)
  }

  return tops.map((top) => {
    const node = toNode(top)
    const kids = replies.get(top.id) ?? []
    if (nestMentions) nestByMentions(node, kids)
    else node.replies = kids.map(toNode)
    return node
  })
}

function renderNode(
  node: CommentNode,
  prefix: string,
  isLast: boolean,
  options: TreeOptions,
): string[] {
  const branch = isLast ? "└─" : "├─"
  const likes =
    options.showLikes && node.likeCount > 0
      ? ` · ${node.likeLabel || node.likeCount}`
      : ""
  const text = sanitizeText(node.text)
  const body = text ? ` ${text}` : ""
  const line = `${prefix}${branch}@${node.author}${body}${likes}`
  const childPrefix = prefix + (isLast ? "    " : "│  ")
  const childLines = node.replies.flatMap((child, index) =>
    renderNode(child, childPrefix, index === node.replies.length - 1, options),
  )
  return [line, ...childLines]
}

export function renderTree(
  title: string,
  roots: CommentNode[],
  options: TreeOptions,
): string {
  const lines = [title]
  roots.forEach((node, index) => {
    lines.push(
      ...renderNode(node, "", index === roots.length - 1, options),
    )
  })
  return lines.join("\n")
}

export function countNodes(nodes: CommentNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.replies), 0)
}
