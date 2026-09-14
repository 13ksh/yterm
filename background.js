importScripts("shared.js");

const API_BASE = "https://del.kpixel.net/";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FAIL_TTL_MS = 10 * 60 * 1000;
const MAX_CONCURRENCY = 4;

const memory = {
  cache: {},
  enabled: true,
  stats: { lookups: 0, hidden: 0, flagged: 0 },
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
    stats: { lookups: 0, hidden: 0, flagged: 0 },
  });
  memory.cache = stored.cache || {};
  memory.enabled = stored.enabled !== false;
  memory.stats = stored.stats || { lookups: 0, hidden: 0, flagged: 0 };
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
  if (type === "GET_STATE") {
    sendResponse({
      enabled: memory.enabled,
      stats: memory.stats,
      cacheSize: Object.keys(memory.cache).length,
      flagged: Object.values(memory.cache).filter((r) => r.flag === "t").length,
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
    memory.stats = { lookups: 0, hidden: 0, flagged: 0 };
    schedulePersist();
    chrome.storage.local.set({ cache: {}, stats: memory.stats });
    sendResponse({ ok: true });
    return false;
  }
  if (type === "REPORT_HIDDEN") {
    memory.stats.hidden = Number(message.count) || 0;
    schedulePersist();
    sendResponse({ ok: true });
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
