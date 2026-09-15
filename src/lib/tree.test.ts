import assert from "node:assert/strict"
import { test } from "node:test"
import { DEMO_COMMENTS, DEMO_TITLE } from "./demo"
import { buildForest, renderTree } from "./tree"

const EXPECTED = `2026 아우라 노래 모음집
├─@hsh 이거 진짜임
│  ├─@사람 ㄹㅇ
│  ├─@disco 그건 아닌듯
│  ├─@licen 뭔 소리임;
│  │  └─@hsh 왜 시비임
│  └─@86 아하
└─@eos 저게 뭐임
    ├─@hdd 노래잖아
    └─@천재 영상임`

test("demo comments render as a boxed reply tree", () => {
  const forest = buildForest(DEMO_COMMENTS, true)
  const tree = renderTree(DEMO_TITLE, forest, {
    nestMentions: true,
    showLikes: false,
  })
  assert.equal(tree, EXPECTED)
})

test("without mention nesting, replies stay one level deep", () => {
  const forest = buildForest(DEMO_COMMENTS, false)
  const hsh = forest[0]
  assert.equal(hsh.replies.length, 5)
  assert.equal(
    hsh.replies.map((reply) => reply.author).join(","),
    "사람,disco,licen,hsh,86",
  )
  assert.equal(hsh.replies[3].text, "@licen 왜 시비임")
})

test("leading invisible characters still nest @mentions", () => {
  const forest = buildForest(
    [
      { id: "a", parentId: null, author: "licen", text: "뭔 소리임;", likeCount: 0 },
      {
        id: "a.b",
        parentId: "a",
        author: "hsh",
        text: "\u200b @licen 왜 시비임",
        likeCount: 0,
      },
    ],
    true,
  )
  assert.equal(forest[0].replies[0].author, "hsh")
  assert.equal(forest[0].replies[0].text, "왜 시비임")
})
