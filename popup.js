const $ = (id) => document.getElementById(id);

const kindLabel = {
  search: "검색 · 숨기지 않음",
  home: "홈 피드 · 필터 적용",
  feed: "피드 · 필터 적용",
  watch: "시청 · 댓글/추천 필터",
  shorts: "쇼츠 피드 · t 채널은 숨기고 0.8~1.6초 처리",
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

function setNote(text, kind) {
  $("updateNote").textContent = text;
  $("updateNote").className = "result" + (kind ? " " + kind : "");
}

function setLink(id, href) {
  const el = $(id);
  if (!href) {
    el.hidden = true;
    el.removeAttribute("href");
    return;
  }
  el.href = href;
  el.hidden = false;
}

async function refresh() {
  const state = await send({ type: "GET_STATE" });
  $("enabled").checked = state.enabled !== false;
  $("flaggedCount").textContent = String(state.flagged || 0);
  $("lookupCount").textContent = String((state.stats && state.stats.lookups) || 0);
  $("cacheSize").textContent = "캐시 " + (state.cacheSize || 0);
  $("installedVersion").textContent = state.version || "–";
  if (state.githubRepo && !$("githubInput").value) {
    $("githubInput").value = "https://github.com/" + state.githubRepo;
  }
  renderUsage(state.usage);

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
        ? "t 쇼츠는 목록에서 빠집니다. 1·2·3에서 2를 숨기면 3에서 위로 1이 그대로 나옵니다."
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
  setNote("채널 캐시만 비웠습니다. 시청·차단 총합은 그대로 둡니다.");
  setLink("updateDownload", "");
  setLink("updatePage", "");
  refresh();
});

$("updateBtn").addEventListener("click", runUpdateCheck);
$("githubInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runUpdateCheck();
});

async function runUpdateCheck() {
  const github = $("githubInput").value.trim();
  setNote("새 버전 확인 중…");
  setLink("updateDownload", "");
  setLink("updatePage", "");
  const res = await send({ type: "CHECK_UPDATE", github: github });
  if (!res || res.error) {
    setNote(
      "업데이트 정보를 읽지 못했습니다. GitHub 저장소가 공개돼 있는지, 주소가 맞는지 확인해 주세요.",
      "unknown"
    );
    if (res && res.page) setLink("updatePage", res.page);
    return;
  }
  if (res.needsRepo) {
    setNote(
      "서버는 없어도 됩니다. 이 프로젝트를 GitHub에 공개한 다음 github.com/아이디/저장소 주소를 넣고 확인을 누르세요.",
      "unknown"
    );
    return;
  }
  if (res.githubRepo) {
    $("githubInput").value = "https://github.com/" + res.githubRepo;
  }
  if (res.newer) {
    const notes = res.notes ? " · " + res.notes.replace(/\s+/g, " ").slice(0, 140) : "";
    setNote(
      "새 버전 " +
        res.latest +
        "이 있습니다" +
        notes +
        ". zip을 받아 푼 뒤 chrome://extensions에서 이 확장을 새로고침하세요.",
      "t"
    );
    setLink("updateDownload", res.zip);
    setLink("updatePage", res.page);
    return;
  }
  setNote("지금 설치본이 최신입니다. " + (res.latest || res.installed), "f");
  setLink("updatePage", res.page);
}

function renderUsage(usage) {
  const todayWatched = (usage && usage.todayWatched) || 0;
  const todayBlocked = (usage && usage.todayBlocked) || 0;
  const totalWatched = (usage && usage.totalWatched) || 0;
  const totalBlocked = (usage && usage.totalBlocked) || 0;
  $("todayWatched").textContent = KPixel.formatUsageNumber(todayWatched);
  $("todayBlocked").textContent = KPixel.formatUsageNumber(todayBlocked);
  $("totalWatched").textContent = KPixel.formatUsageNumber(totalWatched);
  $("totalBlocked").textContent = KPixel.formatUsageNumber(totalBlocked);
  if (!totalWatched && !totalBlocked) {
    $("usageAvg").textContent =
      "유튜브를 보면 본 영상과 차단한 영상 총합이 여기에 쌓입니다. 기기에 따로 저장됩니다.";
    return;
  }
  const days = (usage && usage.days) || 1;
  $("usageAvg").textContent =
    "총 " +
    KPixel.formatUsageNumber(totalWatched) +
    "개 시청 · 총 " +
    KPixel.formatUsageNumber(totalBlocked) +
    "개 차단 · " +
    days +
    "일 저장. 캐시를 비워도 이 숫자는 남습니다.";
}

refresh().then(async () => {
  const github = $("githubInput").value.trim();
  if (!github) return;
  try {
    await runUpdateCheck();
  } catch {
    /* ignore auto-check errors */
  }
});
