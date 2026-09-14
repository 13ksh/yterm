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
};

const inflight = new Map();
let persistTimer = 0;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: true }, (s) => {
    memory.enabled = s.enabled !== false;
  });
});

async function loadState() {
  const stored = await chrome.storage.local.get({
    cache: {},
    enabled: true,
    forceT: [],
    stats: { lookups: 0, hidden: 0, flagged: 0 },
    usageDays: {},
  });
  memory.cache = stored.cache || {};
  memory.enabled = stored.enabled !== false;
  memory.forceT = Array.isArray(stored.forceT) ? stored.forceT : [];
  memory.stats = stored.stats || { lookups: 0, hidden: 0, flagged: 0 };
  memory.usageDays = stored.usageDays || {};
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = 0;
    await chrome.storage.local.set({
      cache: memory.cache,
      enabled: memory.enabled,
      stats: memory.stats,
      usageDays: memory.usageDays,
    });
  }, 400);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message && message.type;
  if (type === "GET_FLAGS") {
    const flags = {};
    for (const [id, row] of Object.entries(memory.cache)) {
      if (row && row.flag) flags[id] = row.flag;
    }
    for (const id of memory.forceT) flags[id] = "t";
    sendResponse({ flags, enabled: memory.enabled });
    return false;
  }
  if (type === "SET_FORCE_T") {
    memory.forceT = [...new Set((message.ids || []).filter(KPixel.isUcId))];
    chrome.storage.local.set({ forceT: memory.forceT });
    sendResponse({ forceT: memory.forceT });
    return false;
  }
  if (type === "GET_STATE") {
    sendResponse({
      enabled: memory.enabled,
      stats: memory.stats,
      cacheSize: Object.keys(memory.cache).length,
      flagged: Object.values(memory.cache).filter((r) => r.flag === "t").length,
      usage: KPixel.summarizeUsage(
        memory.usageDays,
        KPixel.localDayKey()
      ),
    });
    return false;
  }
  if (type === "SET_ENABLED") {
    memory.enabled = !!message.enabled;
    schedulePersist();
    chrome.storage.local.set({ enabled: memory.enabled });
    sendResponse({ enabled: memory.enabled });
    return false;
  }
  if (type === "CLEAR_CACHE") {
    memory.cache = {};
    memory.forceT = [];
    memory.stats = { lookups: 0, hidden: 0, flagged: 0 };
    schedulePersist();
    chrome.storage.local.set({ cache: {}, forceT: [], stats: memory.stats });
    sendResponse({ ok: true });
    return false;
  }
  if (type === "REPORT_HIDDEN") {
    memory.stats.hidden = Number(message.count) || 0;
    schedulePersist();
    sendResponse({ ok: true });
    return false;
  }
  if (type === "RECORD_USAGE") {
    const day = KPixel.localDayKey();
    KPixel.addUsageIds(
      memory.usageDays,
      day,
      "watched",
      message.watchedIds || []
    );
    KPixel.addUsageIds(
      memory.usageDays,
      day,
      "blocked",
      message.blockedIds || []
    );
    schedulePersist();
    sendResponse({
      ok: true,
      usage: KPixel.summarizeUsage(memory.usageDays, day),
    });
    return false;
  }
  if (type === "LOOKUP") {
    lookupMany(message.channelIds || []).then((results) => {
      sendResponse({ results, enabled: memory.enabled });
    });
    return true;
  }
  if (type === "LOOKUP_ONE") {
    lookupOne(message.channelId).then((flag) => {
      sendResponse({ flag, enabled: memory.enabled });
    });
    return true;
  }
  return false;
});

loadState();

self.kpixelSetForceT = async (ids) => {
  memory.forceT = [...new Set((ids || []).filter(KPixel.isUcId))];
  await chrome.storage.local.set({ forceT: memory.forceT });
  return memory.forceT;
};
