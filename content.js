(() => {
  const ATTR = "data-kpixel-hide";
  const STATE = "data-kpixel-state";
  const ITEM_SEL = KPixel.ITEM_SELECTORS.join(",");
  const CHANNEL_LINK_SEL =
    'a[href*="/channel/"], a[href*="/@"], a[href*="/user/"], a[href*="/c/"]';

  function postToPage(payload) {
    window.postMessage(Object.assign({ source: "kpixel-cs" }, payload), "*");
  }

  chrome.runtime.sendMessage({ type: "GET_FLAGS" }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res) {
      postToPage({
        type: "seed",
        flags: res.flags || {},
        enabled: res.enabled,
      });
    }
  });

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "kpixel-page") return;
    if (msg.type === "lookup") {
      const res = await chrome.runtime.sendMessage({
        type: "LOOKUP",
        channelIds: msg.channelIds,
      });
      postToPage({
        type: "flags",
        req: msg.req,
        results: (res && res.results) || {},
      });
      if (res && res.results) {
        for (const [id, flag] of Object.entries(res.results)) flags.set(id, flag);
        scheduleScan(document);
      }
    }
  });


  const handleCache = new Map();
  const pendingIds = new Set();
  const flags = new Map();
  let enabled = true;
  let allowedPrimaryId = null;
  let previousKind = KPixel.getPageKind(location.pathname);
  let scanTimer = 0;
  let hiddenCount = 0;
  let lastReport = 0;

  function pageKind() {
    return KPixel.getPageKind(location.pathname);
  }

  function capturePrimaryIfLanding() {
    const kind = pageKind();
    if (kind === "shorts" && previousKind !== "shorts") {
      allowedPrimaryId = KPixel.extractVideoId(location.pathname);
    } else if (kind !== "shorts") {
      allowedPrimaryId = null;
    }
    previousKind = kind;
  }

  function isAllowedPrimary(el) {
    if (!allowedPrimaryId) return false;
    const hrefs = collectHrefs(el);
    return hrefs.some((h) => KPixel.extractVideoId(h) === allowedPrimaryId);
  }

  function collectHrefs(el) {
    const hrefs = [];
    if (el.getAttribute) {
      const own = el.getAttribute("href");
      if (own) hrefs.push(own);
    }
    el.querySelectorAll &&
      el.querySelectorAll("a[href]").forEach((a) => {
        if (a.href) hrefs.push(a.href);
      });
    return hrefs;
  }

  function readPolymerData(el) {
    if (!el) return null;
    return (
      el.data ||
      (el.__data && (el.__data.data || el.__data)) ||
      el.__dataHost ||
      null
    );
  }

  function channelIdFromElement(el) {
    let node = el;
    for (let i = 0; i < 6 && node; i++) {
      const id = KPixel.extractChannelIdFromData(readPolymerData(node));
      if (id) return { channelId: id, handle: null };
      node = node.parentElement;
    }

    const links = [];
    if (el.matches && el.matches(CHANNEL_LINK_SEL)) links.push(el);
    el.querySelectorAll &&
      el.querySelectorAll(CHANNEL_LINK_SEL).forEach((a) => links.push(a));

    for (const a of links) {
      const parsed = KPixel.parseChannelHref(a.getAttribute("href") || a.href);
      if (parsed.channelId) return parsed;
      if (parsed.handle) {
        const cached = handleCache.get(parsed.handle);
        if (cached) return { channelId: cached, handle: parsed.handle };
        return { channelId: null, handle: parsed.handle };
      }
    }
    return { channelId: null, handle: null };
  }

  async function resolveHandle(handle) {
    const key = KPixel.normalizeHandle(handle);
    if (!key) return null;
    if (handleCache.has(key)) return handleCache.get(key);
    if (key.startsWith("user:") || key.startsWith("c:")) {
      const path = key.startsWith("user:")
        ? "/user/" + key.slice(5)
        : "/c/" + key.slice(2);
      return resolvePath(path, key);
    }
    return resolvePath("/@" + key, key);
  }

  async function resolvePath(path, cacheKey) {
    try {
      const res = await fetch("https://www.youtube.com" + path, {
        credentials: "same-origin",
        cache: "force-cache",
      });
      const html = await res.text();
      const canonical = html.match(
        /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/
      );
      if (canonical && KPixel.isUcId(canonical[1])) {
        handleCache.set(cacheKey, canonical[1]);
        return canonical[1];
      }
      const browse = html.match(/"browseId":"(UC[\w-]{22})"/);
      if (browse && KPixel.isUcId(browse[1])) {
        handleCache.set(cacheKey, browse[1]);
        return browse[1];
      }
      const external = html.match(/"externalId":"(UC[\w-]{22})"/);
      if (external && KPixel.isUcId(external[1])) {
        handleCache.set(cacheKey, external[1]);
        return external[1];
      }
    } catch {
      /* fail open */
    }
    handleCache.set(cacheKey, null);
    return null;
  }

  function hideRoot(el) {
    if (!el || !el.closest) return el;
    const tag = (el.tagName || "").toLowerCase();
    if (tag.includes("comment")) {
      return (
        el.closest("ytd-comment-thread-renderer, ytm-comment-thread-renderer") ||
        el
      );
    }
    return (
      el.closest("ytd-rich-item-renderer, ytm-rich-item-renderer") ||
      el.closest("ytd-compact-video-renderer") ||
      el.closest("ytd-video-renderer") ||
      el.closest("ytd-reel-video-renderer, ytd-reel-item-renderer") ||
      el
    );
  }

  function setHidden(el, hide) {
    const target = hideRoot(el);
    if (!target) return;
    if (hide) {
      target.setAttribute(ATTR, "1");
      target.setAttribute(STATE, "hidden");
    } else {
      target.removeAttribute(ATTR);
      target.setAttribute(STATE, "shown");
    }
  }

  function hideEmptyShelves() {
    document
      .querySelectorAll(
        "ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytd-item-section-renderer"
      )
      .forEach((shelf) => {
        const items = shelf.querySelectorAll(
          "ytd-rich-item-renderer, ytd-reel-item-renderer, ytd-video-renderer, ytd-grid-video-renderer"
        );
        if (!items.length) return;
        const visible = [...items].filter((i) => i.getAttribute(ATTR) !== "1");
        if (visible.length === 0) shelf.setAttribute(ATTR, "1");
        else shelf.removeAttribute(ATTR);
      });
  }

  function skipActiveShortIfNeeded(el) {
    if (!el.matches || !el.matches("ytd-reel-video-renderer")) return;
    if (el.getAttribute(ATTR) !== "1") return;
    const isActive =
      el.hasAttribute("is-active") ||
      el.classList.contains("is-active") ||
      el.querySelector("video");
    if (!isActive) return;
    const btn =
      document.querySelector("#navigation-button-down button") ||
      document.querySelector("ytd-shorts #navigation-button-down button") ||
      document.querySelector('button[aria-label="Next video"]') ||
      document.querySelector('button[aria-label="다음 동영상"]') ||
      document.querySelector('button[aria-label="다음"]');
    if (btn) btn.click();
  }

  function reportHidden() {
    hiddenCount = document.querySelectorAll("[" + ATTR + '="1"]').length;
    const now = Date.now();
    if (now - lastReport < 800) return;
    lastReport = now;
    chrome.runtime.sendMessage({ type: "REPORT_HIDDEN", count: hiddenCount });
  }

  async function lookup(ids) {
    const need = ids.filter((id) => KPixel.isUcId(id) && !flags.has(id) && !pendingIds.has(id));
    need.forEach((id) => pendingIds.add(id));
    if (!need.length) {
      const out = {};
      ids.forEach((id) => {
        if (flags.has(id)) out[id] = flags.get(id);
      });
      return out;
    }
    const response = await chrome.runtime.sendMessage({
      type: "LOOKUP",
      channelIds: need,
    });
    const results = (response && response.results) || {};
    if (response && response.enabled === false) enabled = false;
    for (const [id, flag] of Object.entries(results)) {
      flags.set(id, flag);
      pendingIds.delete(id);
    }
    need.forEach((id) => pendingIds.delete(id));
    return results;
  }

  async function applyElement(el) {
    if (!enabled) {
      setHidden(el, false);
      return;
    }
    if (!el || el.nodeType !== 1) return;
    const kind = pageKind();
    const surface = KPixel.surfaceForElement(el);
    if (!KPixel.shouldFilterSurface(kind, surface)) {
      if (el.getAttribute(STATE) === "hidden") setHidden(el, false);
      return;
    }
    if (isAllowedPrimary(el)) {
      setHidden(el, false);
      return;
    }

    let { channelId, handle } = channelIdFromElement(el);
    if (!channelId && handle) {
      el.setAttribute(STATE, "pending");
      channelId = await resolveHandle(handle);
    }
    if (!channelId) {
      el.setAttribute(STATE, "unknown");
      return;
    }

    if (!flags.has(channelId)) {
      el.setAttribute(STATE, "pending");
      await lookup([channelId]);
    }
    const flag = flags.get(channelId);
    const hide = KPixel.shouldHideFlag(flag);
    setHidden(el, hide);
    if (hide) skipActiveShortIfNeeded(el);
  }

  async function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = [];
    if (scope.matches && scope.matches(ITEM_SEL)) nodes.push(scope);
    scope.querySelectorAll(ITEM_SEL).forEach((n) => nodes.push(n));
    const unique = [...new Set(nodes)];
    const ids = [];
    for (const el of unique) {
      const found = channelIdFromElement(el);
      if (found.channelId) ids.push(found.channelId);
    }
    if (ids.length) await lookup(ids);
    await Promise.all(unique.map((el) => applyElement(el)));
    hideEmptyShelves();
    reportHidden();
  }

  function scheduleScan(root) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(root || document), 80);
  }

  function onNavigate() {
    capturePrimaryIfLanding();
    scheduleScan(document);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      postToPage({ type: "enabled", enabled });
      if (!enabled) {
        document.querySelectorAll("[" + ATTR + '="1"]').forEach((el) => {
          setHidden(el, false);
        });
      } else {
        scheduleScan(document);
      }
    }
    if (changes.forceT) {
      chrome.runtime.sendMessage({ type: "GET_FLAGS" }, (res) => {
        if (res) {
          postToPage({
            type: "seed",
            flags: res.flags || {},
            enabled: res.enabled,
          });
        }
        scheduleScan(document);
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "RESCAN") {
      scheduleScan(document);
      sendResponse({ ok: true });
    }
    if (message && message.type === "PAGE_STATS") {
      sendResponse({
        hidden: document.querySelectorAll("[" + ATTR + '="1"]').length,
        kind: pageKind(),
        found: flags.size,
      });
    }
  });

  const observer = new MutationObserver((mutations) => {
    let dirty = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        dirty = true;
        break;
      }
      if (dirty) break;
    }
    if (dirty) scheduleScan(document);
  });

  function start() {
    capturePrimaryIfLanding();
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
      if (state) enabled = state.enabled !== false;
      scheduleScan(document);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("yt-navigate-finish", onNavigate);
    window.addEventListener("yt-page-data-updated", onNavigate);
    window.addEventListener("yt-navigate-start", () => {
      previousKind = pageKind();
    });
    setInterval(() => {
      const pending = document.querySelectorAll(
        ITEM_SEL + "[" + STATE + '="pending"], ' + ITEM_SEL + ":not([" + STATE + "])"
      );
      if (pending.length) scheduleScan(document);
    }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
