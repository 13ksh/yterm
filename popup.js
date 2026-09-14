const $ = (id) => document.getElementById(id);

const kindLabel = {
  search: "검색 · 숨기지 않음",
  home: "홈 피드 · 필터 적용",
  feed: "피드 · 필터 적용",
  watch: "시청 · 댓글/추천 필터",
  shorts: "쇼츠 피드 · t 채널 1초 시청",
  post: "게시물 · 필터 적용",
  channel: "채널 페이지 · 댓글만 필터",
  other: "기타 페이지",
};

async function send(message) {
  return chrome.runtime.sendMessage(message);
}

async function activeYoutubeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url || !/https:\/\/(www|m)\.youtube\.com\//.test(tab.url)) {
    return null;
  }
  return tab;
}

async function refresh() {
  const state = await send({ type: "GET_STATE" });
  $("enabled").checked = state.enabled !== false;
  $("flaggedCount").textContent = String(state.flagged || 0);
  $("lookupCount").textContent = String((state.stats && state.stats.lookups) || 0);
  $("cacheSize").textContent = "캐시 " + (state.cacheSize || 0);

  const tab = await activeYoutubeTab();
  if (!tab) {
    $("pageKind").textContent = "유튜브 아님";
    $("pageKind").className = "pill";
    $("statusText").textContent =
      "youtube.com을 연 다음 피드·댓글·쇼츠에서 t 채널이 빠집니다.";
    $("hiddenCount").textContent = "–";
    return;
  }

  const path = new URL(tab.url).pathname;
  const kind = KPixel.getPageKind(path);
  $("pageKind").textContent = kindLabel[kind] || kind;
  $("pageKind").className = "pill " + (kind === "search" ? "search" : "filter");
  $("statusText").textContent = state.enabled
    ? kind === "search"
      ? "이 탭은 검색이라 결과를 그대로 둡니다."
      : kind === "shorts"
        ? "t 채널 쇼츠는 1초 시청으로 남기고 다음으로 넘깁니다."
        : "t 채널 항목을 이 페이지에서 숨기고 있습니다."
    : "필터가 꺼져 있습니다.";

  try {
    const page = await chrome.tabs.sendMessage(tab.id, { type: "PAGE_STATS" });
    $("hiddenCount").textContent = String((page && page.hidden) || 0);
  } catch {
    $("hiddenCount").textContent = String((state.stats && state.stats.hidden) || 0);
  }
}

$("enabled").addEventListener("change", async (e) => {
  await send({ type: "SET_ENABLED", enabled: e.target.checked });
  const tab = await activeYoutubeTab();
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "RESCAN" });
    } catch {
      /* content script may not be ready */
    }
  }
  refresh();
});

$("clearCache").addEventListener("click", async () => {
  await send({ type: "CLEAR_CACHE" });
  $("lookupResult").textContent = "캐시를 비웠습니다. 다음 조회부터 다시 확인합니다.";
  $("lookupResult").className = "result";
  refresh();
});

$("lookupBtn").addEventListener("click", runLookup);
$("channelInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runLookup();
});

async function runLookup() {
  const raw = $("channelInput").value.trim();
  const id = raw.replace(/^https?:\/\/(www\.)?youtube\.com\/channel\//, "").split(/[/?#]/)[0];
  if (!KPixel.isUcId(id)) {
    $("lookupResult").textContent = "UC로 시작하는 24자 채널 ID를 넣어 주세요.";
    $("lookupResult").className = "result unknown";
    return;
  }
  $("lookupResult").textContent = "조회 중…";
  $("lookupResult").className = "result";
  const res = await send({ type: "LOOKUP_ONE", channelId: id });
  const flag = res && res.flag;
  if (flag === "t") {
    $("lookupResult").textContent = "t · 피드·댓글·게시물·쇼츠에서 숨깁니다. 검색은 남깁니다.";
    $("lookupResult").className = "result t";
  } else if (flag === "f") {
    $("lookupResult").textContent = "f · 숨기지 않습니다.";
    $("lookupResult").className = "result f";
  } else {
    $("lookupResult").textContent = "응답을 읽지 못했습니다. 잠시 후 다시 확인해 주세요.";
    $("lookupResult").className = "result unknown";
  }
  refresh();
}

refresh();
