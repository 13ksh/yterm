(() => {
  if (window.__kpixelInjected) return;
  window.__kpixelInjected = true;

  const flags = Object.create(null);
  const videoMap = Object.create(null);
  const commentMap = Object.create(null);
  let enabled = true;
  let seq = 0;
  const waiters = new Map();
  const ATTR = "data-kpixel-hide";
  const ROOT_SEL = [
    "yt-lockup-view-model",
    "ytd-rich-item-renderer",
    "ytd-compact-video-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-reel-video-renderer",
    "ytd-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytd-comment-thread-renderer",
    "ytd-comment-view-model",
    "ytd-comment-renderer",
    "ytd-backstage-post-thread-renderer",
    "ytd-post-renderer",
  ].join(",");

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "kpixel-cs") return;
    if (msg.type === "seed" || msg.type === "flags") {
      if (msg.flags) Object.assign(flags, msg.flags);
      if (msg.results) Object.assign(flags, msg.results);
      if (msg.enabled === false) enabled = false;
      const waiter = waiters.get(msg.req);
      if (waiter) waiter();
      applyAll();
    }
    if (msg.type === "enabled") {
      enabled = msg.enabled !== false;
      applyAll();
    }
    if (msg.type === "rescan") applyAll();
  });

  function pageKind() {
    return KPixel.getPageKind(location.pathname);
  }

  function lookup(ids) {
    const need = [
      ...new Set(
        (ids || []).filter((id) => KPixel.isUcId(id) && flags[id] === undefined)
      ),
    ];
    if (!need.length) return Promise.resolve();
    const req = ++seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(req);
        resolve();
      }, 1800);
      waiters.set(req, () => {
        clearTimeout(timer);
        waiters.delete(req);
        resolve();
      });
      window.postMessage(
        { source: "kpixel-page", type: "lookup", req, channelIds: need },
        "*"
      );
    });
  }

  function ingest(data) {
    if (!data) return;
    const indexed = KPixel.indexYoutubeMedia(data, null, 0);
    Object.assign(videoMap, indexed.videos);
    Object.assign(commentMap, indexed.comments);
  }

  async function filterText(text) {
    if (!enabled) return text;
    if (!text || (text[0] !== "{" && text[0] !== "[")) return text;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return text;
    }
    const kind = pageKind();
    ingest(data);
    if (kind === "search") return text;
    await lookup(KPixel.collectChannelIdsFromPayload(data));
    KPixel.filterYoutubePayload(data, flags, kind);
    return JSON.stringify(data);
  }

  function filterObject(data) {
    if (!data) return data;
    ingest(data);
    if (!enabled || pageKind() === "search") return data;
    try {
      lookup(KPixel.collectChannelIdsFromPayload(data));
      KPixel.filterYoutubePayload(data, flags, pageKind());
    } catch {
      /* keep original */
    }
    return data;
  }

  function hideRoot(el) {
    if (!el || !el.closest) return el;
    return el.closest(ROOT_SEL) || el;
  }

  function clearHides() {
    document.querySelectorAll("[" + ATTR + '="1"]').forEach((el) => {
      el.removeAttribute(ATTR);
    });
  }

  function applyDomHides() {
    const kind = pageKind();
    if (!enabled || kind === "search") {
      clearHides();
      return;
    }

    document.querySelectorAll('a[href*="/watch"], a[href*="/shorts/"]').forEach((a) => {
      const href = a.getAttribute("href") || a.href || "";
      const vid = KPixel.extractVideoId(href);
      if (!vid) return;
      const channelId = videoMap[vid];
      if (!channelId || flags[channelId] !== "t") return;
      const surface = href.includes("/shorts/") ? "shorts" : "video";
      if (!KPixel.shouldFilterSurface(kind, surface)) return;
      const root = hideRoot(a);
      if (root) root.setAttribute(ATTR, "1");
    });

    document.querySelectorAll(ROOT_SEL).forEach((el) => {
      if (el.getAttribute(ATTR) === "1") return;
      const ch = KPixel.extractChannelIdFromData(
        el.data || (el.__data && (el.__data.data || el.__data)) || null
      );
      if (!ch) {
        const link = el.querySelector(
          'a[href*="/channel/"], a[href*="/@"]'
        );
        if (!link) return;
        const parsed = KPixel.parseChannelHref(
          link.getAttribute("href") || link.href
        );
        if (!parsed.channelId || flags[parsed.channelId] !== "t") return;
        const surface = KPixel.surfaceForElement(el);
        if (!KPixel.shouldFilterSurface(kind, surface)) return;
        el.setAttribute(ATTR, "1");
        return;
      }
      if (flags[ch] !== "t") return;
      const surface = KPixel.surfaceForElement(el);
      if (!KPixel.shouldFilterSurface(kind, surface)) return;
      el.setAttribute(ATTR, "1");
    });
  }

  function applyAll() {
    if (window.ytInitialData) ingest(window.ytInitialData);
    applyDomHides();
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (!enabled || !KPixel.shouldInterceptYoutubeiUrl(url) || pageKind() === "search") {
      return origFetch.apply(this, arguments);
    }
    return origFetch.apply(this, arguments).then(async (res) => {
      try {
        const text = await res.clone().text();
        const next = await filterText(text);
        if (next === text) return res;
        return new Response(next, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      } catch {
        return res;
      }
    });
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__kpixelUrl = url;
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (
      enabled &&
      KPixel.shouldInterceptYoutubeiUrl(this.__kpixelUrl) &&
      pageKind() !== "search"
    ) {
      this.addEventListener(
        "readystatechange",
        function () {
          if (this.readyState !== 4) return;
          try {
            const raw = this.responseText;
            if (!raw || (raw[0] !== "{" && raw[0] !== "[")) return;
            const data = JSON.parse(raw);
            ingest(data);
            lookup(KPixel.collectChannelIdsFromPayload(data));
            KPixel.filterYoutubePayload(data, flags, pageKind());
            const next = JSON.stringify(data);
            Object.defineProperty(this, "responseText", {
              configurable: true,
              get: () => next,
            });
            Object.defineProperty(this, "response", {
              configurable: true,
              get: () => next,
            });
          } catch {
            /* keep original */
          }
        },
        true
      );
    }
    return xhrSend.apply(this, arguments);
  };

  function trapInitialData(name) {
    let current;
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get() {
        return current;
      },
      set(value) {
        current = value;
        filterObject(value);
        applyDomHides();
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(window, "ytInitialData")) {
    trapInitialData("ytInitialData");
  } else if (window.ytInitialData) {
    filterObject(window.ytInitialData);
  }

  const observer = new MutationObserver(() => {
    applyDomHides();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("yt-navigate-finish", applyAll);
  window.addEventListener("yt-page-data-updated", applyAll);
  setInterval(applyAll, 1500);
})();
