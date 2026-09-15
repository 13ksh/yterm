import type { FlatComment } from "./tree"

export const DEMO_TITLE = "2026 아우라 노래 모음집"

export const DEMO_COMMENTS: FlatComment[] = [
  {
    id: "hsh",
    parentId: null,
    author: "hsh",
    text: "이거 진짜임",
    likeCount: 128,
    likeLabel: "128",
  },
  {
    id: "hsh.사람",
    parentId: "hsh",
    author: "사람",
    text: "ㄹㅇ",
    likeCount: 24,
    likeLabel: "24",
  },
  {
    id: "hsh.disco",
    parentId: "hsh",
    author: "disco",
    text: "그건 아닌듯",
    likeCount: 9,
    likeLabel: "9",
  },
  {
    id: "hsh.licen",
    parentId: "hsh",
    author: "licen",
    text: "뭔 소리임;",
    likeCount: 4,
    likeLabel: "4",
  },
  {
    id: "hsh.hsh2",
    parentId: "hsh",
    author: "hsh",
    text: "@licen 왜 시비임",
    likeCount: 31,
    likeLabel: "31",
  },
  {
    id: "hsh.86",
    parentId: "hsh",
    author: "86",
    text: "아하",
    likeCount: 2,
    likeLabel: "2",
  },
  {
    id: "eos",
    parentId: null,
    author: "eos",
    text: "저게 뭐임",
    likeCount: 56,
    likeLabel: "56",
  },
  {
    id: "eos.hdd",
    parentId: "eos",
    author: "hdd",
    text: "노래잖아",
    likeCount: 18,
    likeLabel: "18",
  },
  {
    id: "eos.genius",
    parentId: "eos",
    author: "천재",
    text: "영상임",
    likeCount: 7,
    likeLabel: "7",
  },
]
