(() => {
  if (window.__kpixelInjected) return;
  window.__kpixelInjected = true;

  const flags = Object.create(null);
  const videoMap = Object.create(null);
  const commentMap = Object.create(null);
  const tWatchByVideo = Object.create(null);
  const hiddenT = Object.create(null);
  const replacedFor = Object.create(null);
  let lastWatchtimeTemplate = null;
  let pendingNextTrim = 0;
  let neighborTrimVid = null;
  let enabled = true;
  let seq = 0;
  const waiters = new Map();
  const pendingUsage = { watched: new Set(), blocked: new Set() };
  let usageTimer = 0;
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

  function flushUsage() {
    usageTimer = 0;
    const watched = [...pendingUsage.watched];
    const blocked = [...pendingUsage.blocked];
    pendingUsage.watched.clear();
    pendingUsage.blocked.clear();
    if (!watched.length && !blocked.length) return;
    window.postMessage(
      { source: "kpixel-page", type: "usage", watched, blocked },
      "*"
    );
  }

  function noteWatched(vid) {
    if (!enabled || !vid) return;
    pendingUsage.watched.add(vid);
    if (!usageTimer) usageTimer = setTimeout(flushUsage, 0);
  }

  function noteBlocked(vid) {
    if (!enabled || !vid) return;
    pendingUsage.blocked.add(vid);
    if (!usageTimer) usageTimer = setTimeout(flushUsage, 0);
  }

  function trackDroppedVideos(dropped) {
    Object.keys(dropped || {}).forEach((id) => {
      if (pageKind() === "shorts") queueHiddenT(id);
      else noteBlocked(id);
    });
  }

  function videoIdFromNode(el) {
    if (!el || !el.querySelector) return null;
    const a = el.querySelector('a[href*="/watch"], a[href*="/shorts/"]');
    if (!a) return null;
    return KPixel.extractVideoId(a.getAttribute("href") || a.href || "");
  }

  function noteCurrentWatch() {
    if (!enabled || pageKind() !== "watch") return;
    const vid = KPixel.extractVideoId(location.pathname + location.search);
    if (vid) noteWatched(vid);
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

  const origSendBeacon = navigator.sendBeacon.bind(navigator);

  function tWatchSeconds(vid) {
    if (!vid) return KPixel.sineWatchSeconds();
    if (tWatchByVideo[vid] == null) {
      tWatchByVideo[vid] = KPixel.sineWatchSeconds();
    }
    return tWatchByVideo[vid];
  }

  function rememberWatchtimeTemplate(url, body) {
    if (!KPixel.isWatchtimeUrl(url)) return;
    lastWatchtimeTemplate = { url: String(url), body: stringifyBody(body) };
  }

  function fireHiddenTWatch(vid) {
    const row = hiddenT[vid];
    if (!row || row.pinged) return;
    if (!lastWatchtimeTemplate) return;
    row.pinged = true;
    const stamped = KPixel.stampWatchtimeVideo(
      lastWatchtimeTemplate.url,
      lastWatchtimeTemplate.body || "",
      vid,
      row.seconds
    );
    try {
      origSendBeacon(stamped.url, stamped.body || undefined);
    } catch {
      /* ignore */
    }
  }

  function queueHiddenT(vid) {
    if (!vid || hiddenT[vid]) return;
    hiddenT[vid] = { seconds: tWatchSeconds(vid), pinged: false };
    pendingNextTrim = KPixel.NEIGHBOR_TRIM_MAX;
    neighborTrimVid = null;
    noteBlocked(vid);
    setTimeout(() => fireHiddenTWatch(vid), 400);
  }

  function neighborTrimFor(url, body) {
    if (!(pendingNextTrim > 0)) return 0;
    const vid =
      KPixel.extractWatchtimeVideoId(url, body) ||
      KPixel.extractVideoId(location.pathname);
    const ch = vid && videoMap[vid];
    if (!vid || !ch || flags[ch] === "t") return 0;
    if (!neighborTrimVid) neighborTrimVid = vid;
    if (vid !== neighborTrimVid) return 0;
    return pendingNextTrim;
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
    const bodyStr = stringifyBody(body);
    if (shouldForceOneSecond(url, bodyStr)) {
      const vid =
        KPixel.extractWatchtimeVideoId(url, bodyStr) ||
        KPixel.extractVideoId(location.pathname);
      if (vid && hiddenT[vid]) hiddenT[vid].pinged = true;
      return KPixel.rewriteWatchtimeRequest(url, bodyStr, tWatchSeconds(vid));
    }
    const trim = neighborTrimFor(url, bodyStr);
    if (trim > 0) return KPixel.trimWatchtimeRequest(url, bodyStr, trim);
    return { url: url, body: body };
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
    rememberWatchtimeTemplate(url, bodyStr);
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
      if (vid && hiddenT[vid]) hiddenT[vid].pinged = true;
      queueHiddenT(vid);
      return KPixel.rewriteWatchtimeRequest(url, bodyStr, tWatchSeconds(vid));
    }
    const trim = neighborTrimFor(url, bodyStr);
    if (trim > 0) return KPixel.trimWatchtimeRequest(url, bodyStr, trim);
    return { url: url, body: body };
  }

  let hideVid = null;
  let shortFlagLookup = false;
  let playRescue = false;
  let coverTimer = 0;

  function hideCover(on) {
    let cover = document.getElementById("kpixel-hide-cover");
    if (on) {
      if (!cover) {
        cover = document.createElement("div");
        cover.id = "kpixel-hide-cover";
        cover.setAttribute("aria-hidden", "true");
        document.documentElement.appendChild(cover);
      }
      cover.hidden = false;
      clearTimeout(coverTimer);
      coverTimer = setTimeout(() => hideCover(false), 2800);
      return;
    }
    clearTimeout(coverTimer);
    coverTimer = 0;
    if (!cover) return;
    cover.hidden = true;
  }

  function isActiveShortRenderer(el) {
    if (!el || !el.matches) return false;
    return el.matches(
      "ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active], ytm-reel-item-renderer[is-active]"
    );
  }

  function canHideShortsRoot(root) {
    if (!root) return false;
    if (isActiveShortRenderer(root)) return false;
    if (root.id === "shorts-player" || root.id === "movie_player") return false;
    if (root.closest && root.closest("#shorts-player, #movie_player")) {
      return false;
    }
    return true;
  }

  function videoIdFromReel(el) {
    if (!el) return null;
    try {
      const data =
        el.data || (el.__data && (el.__data.data || el.__data)) || null;
      const id = KPixel.extractPayloadVideoId(data);
      if (id) return id;
    } catch {
      /* ignore */
    }
    return videoIdFromNode(el);
  }

  function orderedShortIds() {
    const ids = [];
    document
      .querySelectorAll("ytd-reel-video-renderer, ytm-reel-item-renderer")
      .forEach((el) => {
        const id = videoIdFromReel(el);
        if (id && ids[ids.length - 1] !== id) ids.push(id);
      });
    return ids;
  }

  function isDroppedShort(vid) {
    if (!vid) return false;
    if (hiddenT[vid]) return true;
    const ch = videoMap[vid];
    return !!(ch && flags[ch] === "t");
  }

  function dropShortFromLivePlayer(videoId) {
    if (!videoId) return;
    const seen = new Set();
    const roots = [];
    if (window.ytInitialData) roots.push(window.ytInitialData);
    document.querySelectorAll("ytd-shorts, ytd-reel-shelf-renderer").forEach((host) => {
      try {
        if (host.data) roots.push(host.data);
      } catch {
        /* ignore */
      }
    });
    roots.forEach((root) => {
      try {
        KPixel.spliceVideoFromNode(root, videoId, 0, seen);
      } catch {
        /* ignore */
      }
    });
  }

  function hideInactiveTReels() {
    document
      .querySelectorAll("ytd-reel-video-renderer, ytm-reel-item-renderer")
      .forEach((el) => {
        const id = videoIdFromReel(el);
        if (!id) return;
        if (!isDroppedShort(id)) {
          if (el.getAttribute(ATTR) === "1") el.removeAttribute(ATTR);
          return;
        }
        queueHiddenT(id);
        if (!canHideShortsRoot(el)) return;
        el.setAttribute(ATTR, "1");
      });
  }

  function findActiveShortVideo() {
    return (
      document.querySelector(
        "ytd-reel-video-renderer[is-active] video, ytd-reel-video-renderer[active] video, #shorts-player video, .html5-video-player video"
      ) || null
    );
  }

  function ensurePlaying() {
    const video = findActiveShortVideo();
    if (video) {
      if (video.style.opacity === "0") video.style.removeProperty("opacity");
      video.style.removeProperty("visibility");
      if (video.paused) {
        const play = video.play();
        if (play && typeof play.catch === "function") play.catch(() => {});
      }
    }
    try {
      const player =
        document.querySelector("#shorts-player") ||
        document.querySelector("#movie_player") ||
        document.querySelector(".html5-video-player");
      if (player && typeof player.playVideo === "function") player.playVideo();
    } catch {
      /* ignore */
    }
  }

  function replaceCurrentShort(videoId) {
    if (!videoId) return;
    const url = "/shorts/" + videoId;
    try {
      history.replaceState(history.state || {}, "", url);
    } catch {
      /* ignore */
    }
    const endpoint = {
      commandMetadata: {
        webCommandMetadata: {
          url: url,
          webPageType: "WEB_PAGE_TYPE_SHORTS",
        },
      },
      reelWatchEndpoint: { videoId: videoId },
    };
    const app = document.querySelector("ytd-app");
    try {
      if (app && typeof app.handleCommand === "function") {
        app.handleCommand({ command: endpoint }, { replace: true });
      }
    } catch {
      /* fall through */
    }
    try {
      (app || document).dispatchEvent(
        new CustomEvent("yt-navigate", {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: { endpoint: endpoint, replace: true },
        })
      );
    } catch {
      /* ignore */
    }
    try {
      const player =
        document.querySelector("#shorts-player") ||
        document.querySelector("#movie_player") ||
        document.querySelector(".html5-video-player");
      if (player && typeof player.loadVideoById === "function") {
        player.loadVideoById(videoId);
      }
    } catch {
      /* ignore */
    }
  }

  function tickShortsOneSecond() {
    try {
      tickShortsInner();
    } catch {
      /* keep the player alive */
    }
  }

  function tickShortsInner() {
    if (!enabled || pageKind() !== "shorts") {
      hideVid = null;
      playRescue = false;
      hideCover(false);
      return;
    }
    refreshMediaMaps();
    hideInactiveTReels();
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
      hideCover(false);
      if (hideVid && hideVid !== vid) {
        hideVid = null;
      }
      if (pendingNextTrim > 0) {
        if (!neighborTrimVid) neighborTrimVid = vid;
        else if (neighborTrimVid !== vid) {
          pendingNextTrim = 0;
          neighborTrimVid = null;
        }
      }
      if (lastWatchtimeTemplate) {
        Object.keys(hiddenT).forEach((id) => fireHiddenTWatch(id));
      }
      noteWatched(vid);
      if (playRescue) {
        playRescue = false;
        ensurePlaying();
      }
      return;
    }
    queueHiddenT(vid);
    hideCover(true);
    const nextId = KPixel.nextKeptShortId(orderedShortIds(), vid, isDroppedShort);
    hideInactiveTReels();
    if (!nextId) return;
    if (replacedFor[vid] === nextId) return;
    replacedFor[vid] = nextId;
    hideVid = vid;
    playRescue = true;
    dropShortFromLivePlayer(vid);
    hideInactiveTReels();
    replaceCurrentShort(nextId);
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
      const dropped = {};
      KPixel.filterYoutubePayload(data, flags, kind, dropped);
      trackDroppedVideos(dropped);
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
        const dropped = {};
        KPixel.filterYoutubePayload(data, flags, pageKind(), dropped);
        trackDroppedVideos(dropped);
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
      if (root) {
        if (kind === "shorts" && !canHideShortsRoot(root)) return;
        root.setAttribute(ATTR, "1");
        if (surface === "video" || surface === "shorts") noteBlocked(vid);
      }
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
        if (kind === "shorts" && !canHideShortsRoot(el)) return;
        el.setAttribute(ATTR, "1");
        if (surface === "video" || surface === "shorts") {
          noteBlocked(videoIdFromNode(el));
        }
        return;
      }
      if (flags[ch] !== "t") return;
      const surface = KPixel.surfaceForElement(el);
      if (!KPixel.shouldFilterSurface(kind, surface)) return;
      if (kind === "shorts" && !canHideShortsRoot(el)) return;
      el.setAttribute(ATTR, "1");
      if (surface === "video" || surface === "shorts") {
        noteBlocked(videoIdFromNode(el));
      }
    });
  }

  function applyAll() {
    refreshMediaMaps();
    lookup(Object.values(videoMap)).then(() => {
      applyDomHides();
      tickShortsOneSecond();
      noteCurrentWatch();
    });
    applyDomHides();
    tickShortsOneSecond();
    noteCurrentWatch();
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
    if (KPixel.isWatchtimeUrl(url) && pageKind() === "shorts") {
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
    if (KPixel.isWatchtimeUrl(url) && pageKind() === "shorts") {
      const rewritten = rewriteOutgoing(url, bodyStr);
      nextBody = typeof rewritten.body === "string" && rewritten.body ? rewritten.body : body;
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
            const dropped = {};
            KPixel.filterYoutubePayload(data, flags, pageKind(), dropped);
            trackDroppedVideos(dropped);
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

  navigator.sendBeacon = function (url, data) {
    try {
      if (enabled && pageKind() === "shorts" && KPixel.isWatchtimeUrl(url)) {
        const deliver = (next, original) => {
          if (original == null || typeof original === "string") {
            return origSendBeacon(next.url, next.body || undefined);
          }
          if (
            typeof URLSearchParams !== "undefined" &&
            original instanceof URLSearchParams
          ) {
            return origSendBeacon(next.url, next.body);
          }
          if (typeof Blob !== "undefined" && original instanceof Blob) {
            origSendBeacon(next.url, new Blob([next.body || ""], { type: original.type }));
            return true;
          }
          return origSendBeacon(next.url, original);
        };
        if (data == null || typeof data === "string") {
          if (!shortsWatchtimeNeedsWait(url, data || "")) {
            const next = rewriteOutgoing(url, data || "");
            return origSendBeacon(next.url, next.body || undefined);
          }
          prepareWatchtime(url, data || "").then((next) => deliver(next, data));
          return true;
        }
        if (typeof URLSearchParams !== "undefined" && data instanceof URLSearchParams) {
          if (!shortsWatchtimeNeedsWait(url, data.toString())) {
            const next = rewriteOutgoing(url, data.toString());
            return origSendBeacon(next.url, next.body);
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
    return origSendBeacon(url, data);
  };

  function rewriteMaybeSrc(value) {
    const url = String(value || "");
    if (!KPixel.isWatchtimeUrl(url)) return value;
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
