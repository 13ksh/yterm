const SAMPLE = [
  {
    id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
    name: "Linus Tech Tips",
    title: "작업실 투어",
    kind: "video",
  },
  {
    id: "UCX6OQ3DkcsbYNE6H8uQQuVA",
    name: "MrBeast",
    title: "100일 생존",
    kind: "video",
  },
  {
    id: "UC-lHJZR3Gqxm24_Vd_AJ5Yw",
    name: "PewDiePie",
    title: "쇼츠 클립",
    kind: "shorts",
  },
  {
    id: "UCBJycsmduzYozGAhjUqL4Yw",
    name: "Marques Brownlee",
    title: "폰 리뷰 댓글",
    kind: "comment",
    text: "배터리 테스트 수치 더 올려 주세요.",
  },
  {
    id: "UCsXVk37bltHxD1rDPwtNM8Q",
    name: "Kurzgesagt",
    title: "커뮤니티 게시물",
    kind: "post",
    text: "다음 영상 주제 투표가 올라왔습니다.",
  },
  {
    id: "UCYO_jab_esuFRV4b17AJtAw",
    name: "3Blue1Brown",
    title: "수학 쇼츠",
    kind: "shorts",
  },
];

const DEMO_T = {
  id: "UCdemoTChannelIdXXXXXX12",
  name: "미리보기용 t 채널",
  title: "이 카드는 t 응답 예시입니다",
  kind: "video",
  text: "검색 탭에서는 남고, 피드·댓글·쇼츠·게시물 탭에서는 사라집니다.",
  demoFlag: "t",
};

const HINTS = {
  home: "홈 동영상 피드입니다. t 채널 카드는 숨깁니다.",
  shorts: "쇼츠 피드입니다. t 채널 쇼츠는 숨깁니다.",
  comments: "댓글 목록입니다. t 채널 댓글은 숨깁니다.",
  posts: "커뮤니티 게시물입니다. t 채널 글은 숨깁니다.",
  search: "검색 결과입니다. t여도 숨기지 않습니다.",
};

const flags = new Map([[DEMO_T.id, "t"]]);
let view = "home";

function pageKindForView(name) {
  if (name === "search") return "search";
  if (name === "shorts") return "shorts";
  if (name === "comments") return "watch";
  if (name === "posts") return "home";
  return "home";
}

function surfaceForView(name, itemKind) {
  if (name === "comments") return "comment";
  if (name === "posts") return "post";
  if (name === "shorts") return "shorts";
  return itemKind === "shorts" ? "shorts" : "video";
}

function itemsForView() {
  const extra = { ...DEMO_T };
  if (view === "shorts") extra.kind = "shorts";
  if (view === "comments") extra.kind = "comment";
  if (view === "posts") extra.kind = "post";
  const list = [...SAMPLE, extra];
  if (view === "shorts") return list.filter((i) => i.kind === "shorts" || i === extra || i.id === extra.id);
  if (view === "comments") return list.filter((i) => i.kind === "comment" || i.id === extra.id);
  if (view === "posts") return list.filter((i) => i.kind === "post" || i.id === extra.id);
  return list.filter((i) => i.kind === "video" || i.kind === "shorts" || i.id === extra.id);
}

function render() {
  const feed = document.getElementById("feed");
  const hint = document.getElementById("hint");
  const count = document.getElementById("count");
  hint.textContent = HINTS[view];
  feed.className = "feed " + (view === "shorts" ? "shorts" : view === "comments" || view === "posts" ? view : view);
  feed.replaceChildren();
  const kind = pageKindForView(view);
  let hidden = 0;
  let shown = 0;
  for (const item of itemsForView()) {
    const flag = flags.get(item.id) || item.demoFlag || "unknown";
    const surface = surfaceForView(view, item.kind);
    const hide =
      KPixel.shouldHideFlag(flag) && KPixel.shouldFilterSurface(kind, surface);
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.channel = item.id;
    if (hide) {
      card.setAttribute("data-kpixel-hide", "1");
      hidden += 1;
    } else {
      shown += 1;
    }
    card.innerHTML = `
      <div class="thumb"></div>
      <h3>${item.title}</h3>
      <p>${item.name}${item.text ? " · " + item.text : ""}</p>
      <span class="badge ${flag}">${flag === "t" ? "API t · 숨김 대상" : flag === "f" ? "API f · 유지" : "조회 중"}</span>
    `;
    feed.appendChild(card);
  }
  count.textContent = hideSummary(shown, hidden);
}

function hideSummary(shown, hidden) {
  if (view === "search") {
    return `검색이라 ${shown}개를 모두 보여 줍니다. 숨긴 항목 없음.`;
  }
  return `보이는 항목 ${shown}개 · 숨긴 t 항목 ${hidden}개`;
}

async function lookup(id) {
  if (id === DEMO_T.id) {
    flags.set(id, "t");
    return "t";
  }
  if (!KPixel.isUcId(id)) return "unknown";
  const res = await fetch("/api/" + encodeURIComponent(id));
  const text = await res.text();
  const flag = KPixel.parseFlagResponse(text);
  flags.set(id, flag);
  return flag;
}

async function hydrate() {
  await Promise.all(SAMPLE.map((item) => lookup(item.id)));
  render();
}

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    view = btn.dataset.view;
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b === btn));
    render();
  });
});

document.getElementById("liveBtn").addEventListener("click", async () => {
  const input = document.getElementById("liveId");
  const out = document.getElementById("liveOut");
  const id = input.value.trim();
  if (!KPixel.isUcId(id)) {
    out.textContent = "UC로 시작하는 24자 채널 ID가 필요합니다.";
    return;
  }
  out.textContent = "조회 중…";
  try {
    const flag = await lookup(id);
    out.textContent =
      flag === "t"
        ? "t · 확장 프로그램이 피드·댓글·게시물·쇼츠에서 숨깁니다."
        : flag === "f"
          ? "f · 숨기지 않습니다."
          : "t/f가 아닌 응답입니다.";
  } catch {
    out.textContent = "API에 연결하지 못했습니다.";
  }
});

hydrate();
