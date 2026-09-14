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

  function stringifyBody(body) {
    if (body == null) return "";
    if (typeof body === "string") return body;
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return body.toString();
    }
    return "";
  }

  function ingest(data) {
    if (!data) return;
    const indexed = KPixel.indexYoutubeMedia(data, null, 0);
    Object.assign(videoMap, indexed.videos);
    Object.assign(commentMap, indexed.comments);
    if (indexed.ownerHint) {
      const vid = KPixel.extractVideoId(location.pathname);
      if (vid && !videoMap[vid]) videoMap[vid] = indexed.ownerHint;
    }
  }

  function scrapeActiveShortChannel() {
    if (pageKind() !== "shorts") return;
    const vid = KPixel.extractVideoId(location.pathname);
    if (!vid) return;
    try {
      document
        .querySelectorAll(
          "#movie_player, #shorts-player, .html5-video-player"
        )
        .forEach((player) => {
          if (typeof player.getPlayerResponse === "function") {
            ingest(player.getPlayerResponse());
          }
        });
    } catch {
      /* player not ready */
    }
    const roots = document.querySelectorAll(
      "ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active], ytd-reel-player-header-renderer, ytd-reel-player-overlay-renderer, ytd-shorts, ytm-reel-player-overlay-renderer"
    );
    roots.forEach((el) => {
      try {
        const data =
          el.data || (el.__data && (el.__data.data || el.__data)) || null;
        if (data) ingest(data);
      } catch {
        /* ignore */
      }
      if (videoMap[vid]) return;
      const link =
        el.querySelector && el.querySelector('a[href*="/channel/"]');
      if (!link) return;
      const parsed = KPixel.parseChannelHref(
        link.getAttribute("href") || link.href
      );
      if (parsed.channelId) videoMap[vid] = parsed.channelId;
    });
  }

  function refreshMediaMaps() {
    if (window.ytInitialData) ingest(window.ytInitialData);
    if (window.ytInitialPlayerResponse) ingest(window.ytInitialPlayerResponse);
    scrapeActiveShortChannel();
  }

  function shouldForceOneSecond(url, body) {
    return KPixel.shouldRewriteShortsWatchtime(
      pageKind(),
      enabled,
      flags,
      videoMap,
      url,
      body,
      location.pathname
    );
  }

  function rewriteOutgoing(url, body) {
    if (!shouldForceOneSecond(url, body)) {
      return { url: url, body: body };
    }
    return KPixel.rewriteWatchtimeRequest(url, body == null ? "" : body);
  }

  function shortsWatchtimeNeedsWait(url, body) {
    if (!enabled || pageKind() !== "shorts" || !KPixel.isWatchtimeUrl(url)) {
      return false;
    }
    refreshMediaMaps();
    const vid =
      KPixel.extractWatchtimeVideoId(url, body) ||
      KPixel.extractVideoId(location.pathname);
    const ch = vid && videoMap[vid];
    return !!(ch && flags[ch] === undefined);
  }

  async function prepareWatchtime(url, body) {
    const bodyStr = stringifyBody(body);
    if (!enabled || pageKind() !== "shorts" || !KPixel.isWatchtimeUrl(url)) {
      return { url: url, body: body };
    }
    refreshMediaMaps();
    const vid =
      KPixel.extractWatchtimeVideoId(url, bodyStr) ||
      KPixel.extractVideoId(location.pathname);
    const ch = vid && videoMap[vid];
    if (ch && flags[ch] === undefined) await lookup([ch]);
    if (
      KPixel.shouldRewriteShortsWatchtime(
        pageKind(),
        enabled,
        flags,
        videoMap,
        url,
        bodyStr,
        location.pathname
      )
    ) {
      return KPixel.rewriteWatchtimeRequest(url, bodyStr);
    }
    return { url: url, body: body };
  }

  let skipTimer = 0;
  let skipVid = null;
  let shortFlagLookup = false;

  function goNextShort() {
    const btn =
      document.querySelector("#navigation-button-down button") ||
      document.querySelector("ytd-shorts #navigation-button-down button") ||
      document.querySelector('button[aria-label="Next video"]') ||
      document.querySelector('button[aria-label="다음 동영상"]') ||
      document.querySelector('button[aria-label="다음"]');
    if (btn) {
      btn.click();
      return;
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        keyCode: 40,
        which: 40,
        bubbles: true,
      })
    );
  }

  function tickShortsOneSecond() {
    if (!enabled || pageKind() !== "shorts") {
      skipVid = null;
      clearTimeout(skipTimer);
      return;
    }
    refreshMediaMaps();
    const vid = KPixel.extractVideoId(location.pathname);
    if (!vid) return;
    const ch = videoMap[vid];
    if (!ch) return;
    if (flags[ch] === undefined) {
      if (!shortFlagLookup) {
        shortFlagLookup = true;
        lookup([ch]).finally(() => {
          shortFlagLookup = false;
          tickShortsOneSecond();
        });
      }
      return;
    }
    if (flags[ch] !== "t") {
      if (skipVid !== vid) {
        clearTimeout(skipTimer);
        skipVid = null;
      }
      return;
    }
    if (skipVid === vid) return;
    skipVid = vid;
    clearTimeout(skipTimer);
    skipTimer = setTimeout(() => {
      if (KPixel.extractVideoId(location.pathname) === vid) goNextShort();
    }, 1000);
  }

  async function filterText(text, filterPayload) {
    if (!enabled) return text;
    if (!text || (text[0] !== "{" && text[0] !== "[")) return text;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return text;
    }
    ingest(data);
    const kind = pageKind();
    const ids = KPixel.collectChannelIdsFromPayload(data).concat(
      Object.values(videoMap)
    );
    await lookup(ids);
    if (filterPayload && kind !== "search") {
      KPixel.filterYoutubePayload(data, flags, kind);
      return JSON.stringify(data);
    }
    return text;
  }

  function filterObject(data, filterPayload) {
    if (!data) return data;
    ingest(data);
    if (!enabled || pageKind() === "search") return data;
    try {
      lookup(
        KPixel.collectChannelIdsFromPayload(data).concat(Object.values(videoMap))
      );
      if (filterPayload !== false) {
        KPixel.filterYoutubePayload(data, flags, pageKind());
      }
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
    refreshMediaMaps();
    lookup(Object.values(videoMap)).then(() => {
      applyDomHides();
      tickShortsOneSecond();
    });
    applyDomHides();
    tickShortsOneSecond();
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const run = async () => {
      let nextInput = input;
      let nextInit = init;
      try {
        const req = input instanceof Request ? input : null;
        let url = req ? req.url : String(input);
        let body = init && init.body;
        if (
          req &&
          (body === undefined || body === null) &&
          req.method !== "GET" &&
          req.method !== "HEAD"
        ) {
          try {
            body = await req.clone().text();
          } catch {
            body = "";
          }
        }
        const bodyStr = stringifyBody(body);
        if (KPixel.isWatchtimeUrl(url) && pageKind() === "shorts") {
          const rewritten = await prepareWatchtime(url, bodyStr);
          if (rewritten.url !== url || rewritten.body !== body) {
            if (req && (!init || init.body == null)) {
              nextInput = rewritten.url;
              nextInit = {
                method: req.method,
                headers: req.headers,
                body:
                  req.method === "GET" || req.method === "HEAD"
                    ? undefined
                    : rewritten.body,
                credentials: req.credentials,
                cache: req.cache,
                mode: req.mode,
                redirect: req.redirect,
                referrer: req.referrer,
              };
            } else {
              nextInput = rewritten.url;
              nextInit = Object.assign({}, init || {}, {
                body:
                  init && init.body != null ? rewritten.body : init && init.body,
              });
            }
            url = rewritten.url;
          }
        }
        const res = await origFetch.call(window, nextInput, nextInit);
        if (!enabled || pageKind() === "search") return res;
        const ingestIt = KPixel.shouldIngestYoutubeiUrl(url);
        const filterIt = KPixel.shouldInterceptYoutubeiUrl(url);
        if (!ingestIt) return res;
        try {
          const text = await res.clone().text();
          const next = await filterText(text, filterIt);
          if (next === text) return res;
          return new Response(next, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        } catch {
          return res;
        }
      } catch {
        return origFetch.apply(window, arguments);
      }
    };
    return run();
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__kpixelMethod = method;
    this.__kpixelRawUrl = url;
    this.__kpixelRest = rest;
    this.__kpixelAsync = rest.length === 0 || rest[0] !== false;
    this.__kpixelHeaders = [];
    if (
      this.__kpixelAsync &&
      enabled &&
      pageKind() === "shorts" &&
      KPixel.isWatchtimeUrl(url)
    ) {
      this.__kpixelDeferWatchtime = true;
      this.__kpixelUrl = url;
      return;
    }
    let nextUrl = url;
    if (shouldForceOneSecond(url, "")) {
      nextUrl = rewriteOutgoing(url, "").url;
    }
    this.__kpixelUrl = nextUrl;
    return xhrOpen.call(this, method, nextUrl, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    if (this.__kpixelDeferWatchtime) {
      this.__kpixelHeaders.push([key, value]);
      return;
    }
    return xhrSetHeader.call(this, key, value);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const bodyStr = stringifyBody(body);
    const flushDeferred = (nextUrl, nextBody) => {
      xhrOpen.call(
        this,
        this.__kpixelMethod,
        nextUrl,
        ...this.__kpixelRest
      );
      for (const [key, value] of this.__kpixelHeaders || []) {
        xhrSetHeader.call(this, key, value);
      }
      xhrSend.call(this, nextBody);
    };
    if (this.__kpixelDeferWatchtime) {
      prepareWatchtime(this.__kpixelRawUrl, bodyStr)
        .then((next) => {
          flushDeferred(
            next.url,
            typeof next.body === "string" && next.body ? next.body : body
          );
        })
        .catch(() => flushDeferred(this.__kpixelRawUrl, body));
      return;
    }
    const url = this.__kpixelUrl;
    const sendNow = (nextBody) => xhrSend.call(this, nextBody);
    let nextBody = body;
    if (shouldForceOneSecond(url, bodyStr) && bodyStr) {
      nextBody = rewriteOutgoing(url, bodyStr).body;
    }
    if (
      enabled &&
      KPixel.shouldIngestYoutubeiUrl(this.__kpixelUrl) &&
      pageKind() !== "search"
    ) {
      const filterIt = KPixel.shouldInterceptYoutubeiUrl(this.__kpixelUrl);
      this.addEventListener(
        "readystatechange",
        function () {
          if (this.readyState !== 4) return;
          try {
            const raw = this.responseText;
            if (!raw || (raw[0] !== "{" && raw[0] !== "[")) return;
            const data = JSON.parse(raw);
            ingest(data);
            lookup(
              KPixel.collectChannelIdsFromPayload(data).concat(
                Object.values(videoMap)
              )
            );
            if (!filterIt) return;
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
    return sendNow(nextBody);
  };

  const origBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = function (url, data) {
    try {
      if (enabled && pageKind() === "shorts" && KPixel.isWatchtimeUrl(url)) {
        const deliver = (next, original) => {
          if (original == null || typeof original === "string") {
            return origBeacon(next.url, next.body || undefined);
          }
          if (
            typeof URLSearchParams !== "undefined" &&
            original instanceof URLSearchParams
          ) {
            return origBeacon(next.url, next.body);
          }
          if (typeof Blob !== "undefined" && original instanceof Blob) {
            origBeacon(next.url, new Blob([next.body || ""], { type: original.type }));
            return true;
          }
          return origBeacon(next.url, original);
        };
        if (data == null || typeof data === "string") {
          if (!shortsWatchtimeNeedsWait(url, data || "")) {
            const next = rewriteOutgoing(url, data || "");
            return origBeacon(next.url, next.body || undefined);
          }
          prepareWatchtime(url, data || "").then((next) => deliver(next, data));
          return true;
        }
        if (typeof URLSearchParams !== "undefined" && data instanceof URLSearchParams) {
          if (!shortsWatchtimeNeedsWait(url, data.toString())) {
            const next = rewriteOutgoing(url, data.toString());
            return origBeacon(next.url, next.body);
          }
          prepareWatchtime(url, data.toString()).then((next) => deliver(next, data));
          return true;
        }
        if (typeof Blob !== "undefined" && data instanceof Blob) {
          data.text().then((text) => {
            prepareWatchtime(url, text).then((next) => deliver(next, data));
          });
          return true;
        }
      }
    } catch {
      /* fall through */
    }
    return origBeacon(url, data);
  };

  function rewriteMaybeSrc(value) {
    const url = String(value || "");
    if (!shouldForceOneSecond(url, "")) return value;
    return rewriteOutgoing(url, "").url;
  }

  const imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (imgSrc && imgSrc.set) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: imgSrc.enumerable,
      get: imgSrc.get,
      set(value) {
        const url = String(value || "");
        if (enabled && pageKind() === "shorts" && KPixel.isWatchtimeUrl(url)) {
          if (!shortsWatchtimeNeedsWait(url, "")) {
            imgSrc.set.call(this, rewriteMaybeSrc(value));
            return;
          }
          prepareWatchtime(url, "").then((next) => {
            imgSrc.set.call(this, next.url);
          });
          return;
        }
        imgSrc.set.call(this, rewriteMaybeSrc(value));
      },
    });
  }

  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (
      this instanceof HTMLImageElement &&
      String(name).toLowerCase() === "src"
    ) {
      const url = String(value || "");
      if (enabled && pageKind() === "shorts" && KPixel.isWatchtimeUrl(url)) {
        if (!shortsWatchtimeNeedsWait(url, "")) {
          value = rewriteMaybeSrc(value);
          return origSetAttribute.call(this, name, value);
        }
        prepareWatchtime(url, "").then((next) => {
          origSetAttribute.call(this, name, next.url);
        });
        return;
      }
      value = rewriteMaybeSrc(value);
    }
    return origSetAttribute.call(this, name, value);
  };

  function trapInitialData(name, filterPayload) {
    let current;
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get() {
        return current;
      },
      set(value) {
        current = value;
        filterObject(value, filterPayload);
        applyDomHides();
        tickShortsOneSecond();
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(window, "ytInitialData")) {
    trapInitialData("ytInitialData", true);
  } else if (window.ytInitialData) {
    filterObject(window.ytInitialData, true);
  }

  if (!Object.getOwnPropertyDescriptor(window, "ytInitialPlayerResponse")) {
    trapInitialData("ytInitialPlayerResponse", false);
  } else if (window.ytInitialPlayerResponse) {
    filterObject(window.ytInitialPlayerResponse, false);
  }

  const observer = new MutationObserver(() => {
    applyDomHides();
    tickShortsOneSecond();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("yt-navigate-finish", applyAll);
  window.addEventListener("yt-page-data-updated", applyAll);
  setInterval(applyAll, 1500);
})();
