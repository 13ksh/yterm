importScripts("shared.js");

const API_BASE = "https://del.kpixel.net/";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FAIL_TTL_MS = 10 * 60 * 1000;
const MAX_CONCURRENCY = 4;

const memory = {
  cache: {},
  enabled: true,
  forceT: [],
  stats: { lookups: 0, hidden: 0, flagged: 0 },
  usageDays: {},
  usageSafe: KPixel.emptyUsageSafe(),
};

const inflight = new Map();
let persistTimer = 0;
let usageChain = Promise.resolve();
const stateReady = loadState();

chrome.runtime.onInstalled.addListener(() => {
  stateReady.then(() => {
    chrome.storage.local.get({ enabled: true }, (s) => {
      memory.enabled = s.enabled !== false;
    });
  });
});

async function loadState() {
  const stored = await chrome.storage.local.get({
    cache: {},
    enabled: true,
    forceT: [],
    stats: { lookups: 0, hidden: 0, flagged: 0 },
    usageDays: {},
    usageSafe: KPixel.emptyUsageSafe(),
  });
  memory.cache = stored.cache || {};
  memory.enabled = stored.enabled !== false;
  memory.forceT = Array.isArray(stored.forceT) ? stored.forceT : [];
  memory.stats = stored.stats || { lookups: 0, hidden: 0, flagged: 0 };
  memory.usageDays = stored.usageDays || {};
  const summary = KPixel.summarizeUsage(
    memory.usageDays,
    KPixel.localDayKey()
  );
  memory.usageSafe = KPixel.mergeUsageSafe(
    summary,
    stored.usageSafe || KPixel.emptyUsageSafe()
  );
  await persistUsageNow();
}

function usageView() {
  const summary = KPixel.summarizeUsage(
    memory.usageDays,
    KPixel.localDayKey()
  );
  return KPixel.mergeUsageSafe(summary, memory.usageSafe);
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = 0;
    await chrome.storage.local.set({
      cache: memory.cache,
      enabled: memory.enabled,
      stats: memory.stats,
    });
  }, 400);
}

async function persistUsageNow() {
  memory.usageSafe = Object.assign({}, memory.usageSafe, {
    updatedAt: Date.now(),
  });
  await chrome.storage.local.set({
    usageDays: memory.usageDays,
    usageSafe: memory.usageSafe,
  });
}

function recordUsage(watchedIds, blockedIds) {
  usageChain = usageChain.then(async () => {
    await stateReady;
    const day = KPixel.localDayKey();
    const watchedBefore = KPixel.countUsageBucket(
      memory.usageDays[day],
      "watched"
    );
    const blockedBefore = KPixel.countUsageBucket(
      memory.usageDays[day],
      "blocked"
    );
    KPixel.addUsageIds(memory.usageDays, day, "watched", watchedIds || []);
    KPixel.addUsageIds(memory.usageDays, day, "blocked", blockedIds || []);
    const addedWatched =
      KPixel.countUsageBucket(memory.usageDays[day], "watched") - watchedBefore;
    const addedBlocked =
      KPixel.countUsageBucket(memory.usageDays[day], "blocked") - blockedBefore;
    memory.usageSafe = KPixel.bumpUsageSafe(
      memory.usageSafe,
      day,
      addedWatched,
      addedBlocked
    );
    memory.usageSafe = KPixel.mergeUsageSafe(usageView(), memory.usageSafe);
    await persistUsageNow();
    return usageView();
  });
  return usageChain;
}

function readFresh(channelId) {
  const row = memory.cache[channelId];
  if (!row) return null;
  if (Date.now() - row.checkedAt > row.ttl) {
    delete memory.cache[channelId];
    return null;
  }
  return row.flag;
}

async function fetchFlag(channelId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(API_BASE + encodeURIComponent(channelId), {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    memory.stats.lookups += 1;
    const flag = KPixel.parseFlagResponse(text);
    const ttl = flag === "unknown" ? FAIL_TTL_MS : CACHE_TTL_MS;
    memory.cache[channelId] = { flag, checkedAt: Date.now(), ttl };
    if (flag === "t") {
      memory.stats.flagged = Object.values(memory.cache).filter(
        (r) => r.flag === "t"
      ).length;
    }
    schedulePersist();
    return flag;
  } catch {
    memory.cache[channelId] = {
      flag: "unknown",
      checkedAt: Date.now(),
      ttl: FAIL_TTL_MS,
    };
    schedulePersist();
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

async function lookupOne(channelId) {
  if (!KPixel.isUcId(channelId)) return "unknown";
  if (memory.forceT.includes(channelId)) return "t";
  const cached = readFresh(channelId);
  if (cached) return cached;
  if (inflight.has(channelId)) return inflight.get(channelId);
  const job = fetchFlag(channelId).finally(() => inflight.delete(channelId));
  inflight.set(channelId, job);
  return job;
}

async function lookupMany(channelIds) {
  const unique = [...new Set((channelIds || []).filter(KPixel.isUcId))];
  const results = {};
  let i = 0;
  async function worker() {
    while (i < unique.length) {
      const id = unique[i++];
      results[id] = await lookupOne(id);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, unique.length) }, worker)
  );
  return results;
}

async function fetchJson(url, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: extraHeaders || {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function bundledGithubRepo() {
  try {
    const res = await fetch(chrome.runtime.getURL("update-config.json"), {
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = await res.json();
    const parsed = KPixel.parseGithubRepo(data && data.github);
    return parsed ? KPixel.githubRepoSlug(parsed) : "";
  } catch {
    return "";
  }
}

async function checkUpdate(githubHint) {
  const installed = chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get({ githubRepo: "" });
  const parsed = KPixel.parseGithubRepo(
    githubHint || stored.githubRepo || (await bundledGithubRepo())
  );
  if (!parsed) {
    return {
      installed: installed,
      needsRepo: true,
      newer: false,
    };
  }
  const githubRepo = KPixel.githubRepoSlug(parsed);
  await chrome.storage.local.set({ githubRepo: githubRepo });
  const feeds = KPixel.updateFeedUrls(parsed);
  let remote = null;
  for (const url of feeds.json) {
    const data = await fetchJson(url);
    remote = KPixel.parseUpdateManifest(data, feeds);
    if (remote) break;
  }
  if (!remote) {
    const release = await fetchJson(feeds.release, {
      Accept: "application/vnd.github+json",
    });
    remote = KPixel.parseUpdateManifest(release, feeds);
  }
  if (!remote) {
    return {
      installed: installed,
      githubRepo: githubRepo,
      error: true,
      newer: false,
      page: feeds.page,
    };
  }
  const newer = KPixel.compareVersions(remote.version, installed) > 0;
  return {
    installed: installed,
    githubRepo: githubRepo,
    latest: remote.version,
    notes: remote.notes,
    zip: remote.zip,
    page: remote.page || feeds.page,
    newer: newer,
    needsRepo: false,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => {
      if (result !== undefined) sendResponse(result);
    })
    .catch(() => {
      sendResponse({ error: true });
    });
  return true;
});

async function handleMessage(message) {
  await stateReady;
  const type = message && message.type;
  if (type === "GET_FLAGS") {
    const flags = {};
    for (const [id, row] of Object.entries(memory.cache)) {
      if (row && row.flag) flags[id] = row.flag;
    }
    for (const id of memory.forceT) flags[id] = "t";
    return { flags, enabled: memory.enabled };
  }
  if (type === "SET_FORCE_T") {
    memory.forceT = [...new Set((message.ids || []).filter(KPixel.isUcId))];
    await chrome.storage.local.set({ forceT: memory.forceT });
    return { forceT: memory.forceT };
  }
  if (type === "GET_STATE") {
    const stored = await chrome.storage.local.get({ githubRepo: "" });
    return {
      enabled: memory.enabled,
      stats: memory.stats,
      cacheSize: Object.keys(memory.cache).length,
      flagged: Object.values(memory.cache).filter((r) => r.flag === "t").length,
      usage: usageView(),
      version: chrome.runtime.getManifest().version,
      githubRepo: stored.githubRepo || (await bundledGithubRepo()),
    };
  }
  if (type === "SET_ENABLED") {
    memory.enabled = !!message.enabled;
    schedulePersist();
    await chrome.storage.local.set({ enabled: memory.enabled });
    return { enabled: memory.enabled };
  }
  if (type === "CLEAR_CACHE") {
    memory.cache = {};
    memory.forceT = [];
    memory.stats = { lookups: 0, hidden: 0, flagged: 0 };
    await chrome.storage.local.set({
      cache: {},
      forceT: [],
      stats: memory.stats,
    });
    return { ok: true, usage: usageView() };
  }
  if (type === "REPORT_HIDDEN") {
    memory.stats.hidden = Number(message.count) || 0;
    schedulePersist();
    return { ok: true };
  }
  if (type === "RECORD_USAGE") {
    const usage = await recordUsage(
      message.watchedIds || [],
      message.blockedIds || []
    );
    return { ok: true, usage };
  }
  if (type === "LOOKUP") {
    const results = await lookupMany(message.channelIds || []);
    return { results, enabled: memory.enabled };
  }
  if (type === "CHECK_UPDATE") {
    return checkUpdate(message.github);
  }
  if (type === "SET_GITHUB_REPO") {
    const parsed = KPixel.parseGithubRepo(message.github);
    const githubRepo = parsed ? KPixel.githubRepoSlug(parsed) : "";
    await chrome.storage.local.set({ githubRepo: githubRepo });
    return { githubRepo: githubRepo };
  }
  return undefined;
}

self.kpixelSetForceT = async (ids) => {
  await stateReady;
  memory.forceT = [...new Set((ids || []).filter(KPixel.isUcId))];
  await chrome.storage.local.set({ forceT: memory.forceT });
  return memory.forceT;
};
