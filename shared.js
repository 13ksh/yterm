/**
 * Shared helpers for the KPixel YouTube filter.
 */
var KPixel = (function () {
  const UC_RE = /^UC[\w-]{22}$/;
  const UC_IN_TEXT_RE = /UC[\w-]{22}/g;
  const CHANNEL_HREF_RE = /(?:youtube\.com)?\/channel\/(UC[\w-]{22})/i;
  const HANDLE_HREF_RE = /(?:youtube\.com)?\/@([\w.-]+)/i;
  const USER_HREF_RE = /(?:youtube\.com)?\/user\/([\w.-]+)/i;
  const CUSTOM_HREF_RE = /(?:youtube\.com)?\/c\/([\w.-]+)/i;
  const SHORTS_ID_RE = /\/shorts\/([A-Za-z0-9_-]{6,})/;
  const WATCH_ID_RE = /[?&]v=([A-Za-z0-9_-]{6,})/;

  const OWNER_KEY_RE =
    /^(channelid|externalchannelid|authorchannelid|browseid)$/i;
  const OWNER_CONTEXT_RE =
    /(owner|author|byline|channel|uploader|creator|postauthor|lockupmetadata|avatar|canonical|channelnavigation|ownertext|authorendpoint|shortbyline|longbyline)/i;

  const ITEM_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-movie-renderer",
    "ytd-reel-item-renderer",
    "ytd-reel-video-renderer",
    "ytd-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "yt-lockup-view-model",
    "ytd-rich-grid-media",
    "ytd-comment-thread-renderer",
    "ytd-comment-view-model",
    "ytd-comment-renderer",
    "ytd-backstage-post-thread-renderer",
    "ytd-backstage-post-renderer",
    "ytd-post-renderer",
    "ytm-rich-item-renderer",
    "ytm-video-with-context-renderer",
    "ytm-compact-video-renderer",
    "ytm-reel-item-renderer",
    "ytm-comment-thread-renderer",
    "ytm-comment-renderer",
    "ytm-post-renderer",
  ];

  const COMMENT_SELECTORS = [
    "ytd-comment-thread-renderer",
    "ytd-comment-view-model",
    "ytd-comment-renderer",
    "ytm-comment-thread-renderer",
    "ytm-comment-renderer",
  ];

  const POST_SELECTORS = [
    "ytd-backstage-post-thread-renderer",
    "ytd-backstage-post-renderer",
    "ytd-post-renderer",
    "ytm-post-renderer",
  ];

  const SHORTS_SELECTORS = [
    "ytd-reel-item-renderer",
    "ytd-reel-video-renderer",
    "ytd-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-reel-item-renderer",
  ];

  function isUcId(value) {
    return typeof value === "string" && UC_RE.test(value);
  }

  function parseFlagResponse(text) {
    if (typeof text !== "string") return "unknown";
    const v = text.trim().toLowerCase();
    if (v === "t") return "t";
    if (v === "f") return "f";
    return "unknown";
  }

  function shouldHideFlag(flag) {
    return flag === "t";
  }

  function getPageKind(pathname) {
    const path = pathname || "/";
    if (path === "/results" || path.startsWith("/results")) return "search";
    if (path.startsWith("/shorts")) return "shorts";
    if (path === "/watch" || path.startsWith("/watch")) return "watch";
    if (path.startsWith("/post/")) return "post";
    if (path === "/" || path === "") return "home";
    if (path.startsWith("/feed")) return "feed";
    if (/^\/(gaming|trending|podcasts|music|hashtag|source)\b/.test(path)) {
      return "feed";
    }
    if (/^\/(channel\/|@|c\/|user\/)/.test(path)) return "channel";
    return "other";
  }

  /**
   * Search results stay visible. Channel pages stay visible except comments
   * from flagged authors. Everywhere else, hide flagged videos / shorts / posts / comments.
   * Immersive /shorts/ drops t clips from the reel list (1-2-3 → 1-3) instead of
   * advancing past them, so the previous clip is still there when you swipe up.
   */
  function shouldFilterSurface(pageKind, surface) {
    if (pageKind === "search") return false;
    if (pageKind === "channel") return surface === "comment";
    return (
      surface === "video" ||
      surface === "shorts" ||
      surface === "comment" ||
      surface === "post"
    );
  }

  function surfaceForElement(el) {
    if (!el || !el.matches) return "video";
    if (COMMENT_SELECTORS.some((s) => el.matches(s))) return "comment";
    if (POST_SELECTORS.some((s) => el.matches(s))) return "post";
    if (SHORTS_SELECTORS.some((s) => el.matches(s))) return "shorts";
    if (el.querySelector) {
      if (el.querySelector("ytd-post-renderer, ytd-backstage-post-renderer")) {
        return "post";
      }
      if (
        el.querySelector(
          "ytd-shorts-lockup-view-model, ytm-shorts-lockup-view-model, a[href*='/shorts/']"
        ) &&
        !el.querySelector("a[href*='/watch']")
      ) {
        return "shorts";
      }
    }
    return "video";
  }

  function normalizeHandle(handle) {
    if (!handle) return "";
    return String(handle)
      .trim()
      .replace(/^@/, "")
      .replace(/[/?#].*$/, "");
  }

  function parseChannelHref(href) {
    if (!href || typeof href !== "string") return { channelId: null, handle: null };
    const channel = href.match(CHANNEL_HREF_RE);
    if (channel && isUcId(channel[1])) {
      return { channelId: channel[1], handle: null };
    }
    const handle = href.match(HANDLE_HREF_RE);
    if (handle) {
      return { channelId: null, handle: normalizeHandle(handle[1]) };
    }
    const user = href.match(USER_HREF_RE);
    if (user) {
      return { channelId: null, handle: "user:" + user[1] };
    }
    const custom = href.match(CUSTOM_HREF_RE);
    if (custom) {
      return { channelId: null, handle: "c:" + custom[1] };
    }
    return { channelId: null, handle: null };
  }

  function extractVideoId(hrefOrPath) {
    if (!hrefOrPath) return null;
    const shorts = String(hrefOrPath).match(SHORTS_ID_RE);
    if (shorts) return shorts[1];
    const watch = String(hrefOrPath).match(WATCH_ID_RE);
    if (watch) return watch[1];
    return null;
  }

  function reelEndpointVideoId(node, depth) {
    if (!node || typeof node !== "object" || (depth || 0) > 6) return null;
    if (node.reelWatchEndpoint && node.reelWatchEndpoint.videoId) {
      return node.reelWatchEndpoint.videoId;
    }
    if (node.watchEndpoint && node.watchEndpoint.videoId) {
      return node.watchEndpoint.videoId;
    }
    if (node.urlEndpoint && node.urlEndpoint.url) {
      return extractVideoId(node.urlEndpoint.url);
    }
    const next = depth ? depth + 1 : 1;
    return (
      reelEndpointVideoId(node.navigationEndpoint, next) ||
      reelEndpointVideoId(node.endpoint, next) ||
      reelEndpointVideoId(node.command, next) ||
      reelEndpointVideoId(node.innertubeCommand, next) ||
      reelEndpointVideoId(node.onTap, next)
    );
  }

  function extractPayloadVideoId(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const inner =
      (item.richItemRenderer && item.richItemRenderer.content) || item;
    const reel = inner.reelItemRenderer || item.reelItemRenderer;
    if (reel && reel.videoId) return reel.videoId;
    const video =
      inner.videoRenderer ||
      inner.compactVideoRenderer ||
      inner.gridVideoRenderer ||
      item.videoRenderer;
    if (video && video.videoId) return video.videoId;
    const fromEp = reelEndpointVideoId(inner) || reelEndpointVideoId(item);
    if (fromEp) return fromEp;
    if (typeof inner.videoId === "string" && inner.videoId) return inner.videoId;
    if (typeof item.videoId === "string" && item.videoId) return item.videoId;
    if (inner.shortsLockupViewModel) {
      return extractVideoId(
        JSON.stringify(inner.shortsLockupViewModel).slice(0, 8000)
      );
    }
    return null;
  }

  function shouldSpliceSequenceItem(item, videoId) {
    if (!item || !videoId) return false;
    const id = extractPayloadVideoId(item);
    if (id) return id === videoId;
    const videos = indexYoutubeMedia(item, null, 0).videos;
    const keys = Object.keys(videos);
    return keys.length === 1 && keys[0] === videoId;
  }

  function spliceVideoFromNode(node, videoId, depth, seen) {
    if (!node || typeof node !== "object" || !videoId) return 0;
    if (depth > 14) return 0;
    const mark = seen || new Set();
    if (mark.has(node)) return 0;
    mark.add(node);
    let n = 0;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        if (shouldSpliceSequenceItem(node[i], videoId)) {
          node.splice(i, 1);
          n += 1;
          continue;
        }
        n += spliceVideoFromNode(node[i], videoId, depth + 1, mark);
      }
      return n;
    }
    for (const value of Object.values(node)) {
      n += spliceVideoFromNode(value, videoId, depth + 1, mark);
    }
    return n;
  }

  /**
   * After dropping `currentId`, pick the clip that should occupy that slot:
   * the next kept id below, else the previous kept id above.
   * Swiping up from that clip then reaches the original previous item.
   */
  function nextKeptShortId(orderedIds, currentId, isDropped) {
    const ids = orderedIds || [];
    const dropped = typeof isDropped === "function" ? isDropped : () => false;
    let i = ids.indexOf(currentId);
    if (i < 0) {
      for (let k = 0; k < ids.length; k++) {
        if (!dropped(ids[k])) return ids[k];
      }
      return null;
    }
    for (let k = i + 1; k < ids.length; k++) {
      if (!dropped(ids[k])) return ids[k];
    }
    for (let k = i - 1; k >= 0; k--) {
      if (!dropped(ids[k])) return ids[k];
    }
    return null;
  }

  function pickUc(value) {
    if (isUcId(value)) return value;
    if (typeof value === "string") {
      const m = value.match(UC_RE);
      if (m) return m[0];
    }
    return null;
  }

  function extractChannelIdFromData(data) {
    if (data == null) return null;
    if (typeof data === "string") return pickUc(data);
    if (typeof data !== "object") return null;
    const preferred = [];
    const fallback = [];
    gatherUc(data, 0, false, preferred, fallback, 14);
    return preferred[0] || fallback[0] || null;
  }

  function gatherUc(node, depth, inOwner, preferred, fallback, maxDepth) {
    if (node == null || depth > maxDepth) return;
    if (typeof node === "string") {
      const id = pickUc(node);
      if (id) (inOwner ? preferred : fallback).push(id);
      return;
    }
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) {
        gatherUc(item, depth + 1, inOwner, preferred, fallback, maxDepth);
      }
      return;
    }
    const direct =
      pickUc(node.channelId) ||
      pickUc(node.externalChannelId) ||
      pickUc(node.authorChannelId);
    if (direct) {
      preferred.push(direct);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const ownerKey = OWNER_KEY_RE.test(key);
      const ctx =
        inOwner ||
        ownerKey ||
        OWNER_CONTEXT_RE.test(key);
      if (typeof value === "string" && (ownerKey || ctx)) {
        const id = pickUc(value);
        if (id) {
          preferred.push(id);
          continue;
        }
      }
      gatherUc(value, depth + 1, ctx, preferred, fallback, maxDepth);
      if (preferred.length) return;
    }
  }

  function payloadSurface(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (
      item.commentThreadRenderer ||
      item.commentRenderer ||
      item.commentViewModel ||
      item.commentEntityPayload
    ) {
      return "comment";
    }
    if (
      item.backstagePostThreadRenderer ||
      item.backstagePostRenderer ||
      item.postRenderer
    ) {
      return "post";
    }
    const inner =
      (item.richItemRenderer && item.richItemRenderer.content) || item;
    if (
      inner.reelItemRenderer ||
      inner.shortsLockupViewModel ||
      item.reelItemRenderer ||
      item.shortsLockupViewModel
    ) {
      return "shorts";
    }
    if (
      item.videoRenderer ||
      item.compactVideoRenderer ||
      item.gridVideoRenderer ||
      item.lockupViewModel ||
      item.richItemRenderer ||
      item.endScreenVideoRenderer ||
      item.movieRenderer ||
      item.compactMovieRenderer ||
      item.gridVideoRenderer ||
      item.playlistVideoRenderer
    ) {
      return "video";
    }
    return null;
  }

  function shouldDropPayloadItem(item, flags, pageKind) {
    const surface = payloadSurface(item);
    if (!surface || !shouldFilterSurface(pageKind, surface)) return false;
    const id = extractChannelIdFromData(item);
    return !!(id && flags && flags[id] === "t");
  }

  function isEmptyShelf(item) {
    if (!item || typeof item !== "object") return false;
    const shelf =
      item.richShelfRenderer ||
      item.reelShelfRenderer ||
      item.shelfRenderer ||
      (item.richSectionRenderer &&
        item.richSectionRenderer.content &&
        item.richSectionRenderer.content.richShelfRenderer);
    if (!shelf) return false;
    const contents = shelf.contents || shelf.items || [];
    return contents.length === 0;
  }

  function filterYoutubePayload(data, flags, pageKind, droppedVideos) {
    if (!data || typeof data !== "object" || !flags) return data;
    if (pageKind === "search") return data;
    walkFilter(data, flags, pageKind, droppedVideos);
    return data;
  }

  function walkFilter(node, flags, pageKind, droppedVideos) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const el = node[i];
        if (shouldDropPayloadItem(el, flags, pageKind)) {
          if (droppedVideos) {
            Object.assign(droppedVideos, indexYoutubeMedia(el, null, 0).videos);
          }
          node.splice(i, 1);
          continue;
        }
        walkFilter(el, flags, pageKind, droppedVideos);
        if (isEmptyShelf(el)) node.splice(i, 1);
      }
      return;
    }
    for (const value of Object.values(node)) {
      walkFilter(value, flags, pageKind, droppedVideos);
    }
  }

  function collectChannelIdsFromPayload(data) {
    const out = new Set();
    collectFromRenderers(data, out, 0);
    return [...out];
  }

  function collectFromRenderers(node, out, depth) {
    if (!node || depth > 22) return;
    if (Array.isArray(node)) {
      for (const el of node) {
        if (payloadSurface(el)) {
          const id = extractChannelIdFromData(el);
          if (id) out.add(id);
        }
        collectFromRenderers(el, out, depth + 1);
      }
      return;
    }
    if (typeof node === "object") {
      if (node.videoDetails && pickUc(node.videoDetails.channelId)) {
        out.add(node.videoDetails.channelId);
      }
      for (const value of Object.values(node)) {
        collectFromRenderers(value, out, depth + 1);
      }
    }
  }

  function shouldInterceptYoutubeiUrl(url) {
    const u = String(url || "");
    if (u.includes("/youtubei/v1/search")) return false;
    if (u.includes("/youtubei/v1/player")) return false;
    if (u.includes("/youtubei/v1/log")) return false;
    // Current short payload. Stripping it holes the player; the sequence list is filtered instead.
    if (u.includes("/youtubei/v1/reel/reel_item_watch")) return false;
    return u.includes("/youtubei/v1/");
  }

  /** Player/reel JSON is ingested for video→channel maps, but never stripped. */
  function shouldIngestYoutubeiUrl(url) {
    const u = String(url || "");
    if (!u.includes("/youtubei/v1/")) return false;
    if (u.includes("/youtubei/v1/search")) return false;
    if (u.includes("/youtubei/v1/log")) return false;
    return true;
  }

  function isWatchtimeUrl(url) {
    return /\/api\/stats\/watchtime(?:\?|$)/.test(String(url || ""));
  }

  function extractWatchtimeVideoId(url, body) {
    const blob = String(url || "") + "&" + String(body || "");
    const m =
      blob.match(/[?&#]docid=([A-Za-z0-9_-]{6,})/) ||
      blob.match(/[?&#](?:id|v)=([A-Za-z0-9_-]{6,11})(?:&|$)/) ||
      blob.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{6,})"/);
    return m ? m[1] : extractVideoId(blob);
  }

  const T_SHORT_WATCH_MIN = 0.8;
  const T_SHORT_WATCH_MAX = 1.6;
  const NEIGHBOR_TRIM_MAX = 0.2;

  function formatWatchSeconds(n) {
    const x = Math.max(0, Number(n));
    if (!Number.isFinite(x)) return "1.000";
    return x.toFixed(3);
  }

  /**
   * Inverse-CDF of a sine bump on [0, 1]: densest at 0.5.
   * Maps onto [min, max] so 0.8–1.6s clusters around ~1.2s.
   */
  function sineUnit(rand) {
    const roll = typeof rand === "function" ? rand() : Math.random();
    const v = Math.min(1 - 1e-12, Math.max(1e-12, Number(roll) || 0));
    return Math.acos(1 - 2 * v) / Math.PI;
  }

  function sineWatchSeconds(min, max, rand) {
    const lo = min == null ? T_SHORT_WATCH_MIN : min;
    const hi = max == null ? T_SHORT_WATCH_MAX : max;
    return lo + (hi - lo) * sineUnit(rand);
  }

  function readWatchSeconds(value) {
    if (value == null || value === "") return null;
    const str = String(value);
    const last = str.includes(",") ? str.split(",").pop() : str;
    const num = last.includes(":") ? last.split(":").pop() : last;
    const n = parseFloat(num);
    return Number.isFinite(n) ? n : null;
  }

  function forceWatchParams(sp, seconds) {
    if (!sp || typeof sp.get !== "function") return sp;
    const s = formatWatchSeconds(seconds == null ? 1 : seconds);
    const et = sp.get("et");
    const range = et != null && et.includes(":") && !et.includes(",");
    if (range) {
      sp.set("st", "0.000:0.000");
      sp.set("et", "0.000:" + s);
    } else {
      if (sp.has("st") || (et != null && et.includes(","))) sp.set("st", "0.000");
      sp.set("et", s);
    }
    if (sp.has("cmt")) sp.set("cmt", s);
    return sp;
  }

  function forceOneSecondWatchParams(sp) {
    return forceWatchParams(sp, 1);
  }

  function trimWatchParams(sp, trim) {
    if (!sp || typeof sp.get !== "function" || !(trim > 0)) return sp;
    const et = sp.get("et");
    const etSec = readWatchSeconds(et);
    if (etSec != null) {
      const next = formatWatchSeconds(Math.max(0, etSec - trim));
      if (et != null && et.includes(":") && !et.includes(",")) {
        const start = et.split(":")[0];
        sp.set("et", start + ":" + next);
      } else {
        sp.set("et", next);
      }
    }
    if (sp.has("cmt")) {
      const c = readWatchSeconds(sp.get("cmt"));
      if (c != null) sp.set("cmt", formatWatchSeconds(Math.max(0, c - trim)));
    }
    return sp;
  }

  function applyWatchParamsToQuery(query, mutate) {
    const prefix = String(query || "").startsWith("?") ? "?" : "";
    const raw = String(query || "").replace(/^\?/, "");
    const sp = new URLSearchParams(raw);
    mutate(sp);
    return prefix + sp.toString();
  }

  function forceWatchQuery(query, seconds) {
    return applyWatchParamsToQuery(query, (sp) => forceWatchParams(sp, seconds));
  }

  function forceOneSecondWatchQuery(query) {
    return forceWatchQuery(query, 1);
  }

  function rewriteWatchtimeUrl(url, seconds) {
    if (!url) return url;
    try {
      const abs = /^https?:/i.test(url);
      const u = abs
        ? new URL(url)
        : new URL(url, "https://www.youtube.com/");
      forceWatchParams(u.searchParams, seconds == null ? 1 : seconds);
      if (abs) return u.toString();
      return u.pathname + u.search + u.hash;
    } catch {
      return url;
    }
  }

  function trimWatchtimeUrl(url, trim) {
    if (!url || !(trim > 0)) return url;
    try {
      const abs = /^https?:/i.test(url);
      const u = abs
        ? new URL(url)
        : new URL(url, "https://www.youtube.com/");
      trimWatchParams(u.searchParams, trim);
      if (abs) return u.toString();
      return u.pathname + u.search + u.hash;
    } catch {
      return url;
    }
  }

  function setWatchtimeDocId(sp, videoId) {
    if (!sp || !videoId) return sp;
    if (sp.has("docid")) sp.set("docid", videoId);
    else if (sp.has("id")) sp.set("id", videoId);
    else sp.set("docid", videoId);
    return sp;
  }

  function rewriteWatchTimeFields(node, depth, seconds) {
    if (!node || depth > 10) return;
    const s = seconds == null ? 1 : seconds;
    if (Array.isArray(node)) {
      for (const item of node) rewriteWatchTimeFields(item, depth + 1, s);
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (
        /^(et|cmt|watchTimeSeconds|mediaTimeSeconds|elapsedMediaTimeSeconds)$/i.test(
          key
        )
      ) {
        if (typeof value === "number") node[key] = s;
        else if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
          node[key] = formatWatchSeconds(s);
        }
      } else if (value && typeof value === "object") {
        rewriteWatchTimeFields(value, depth + 1, s);
      }
    }
  }

  function mutateWatchtimeRequest(url, body, mutateUrl, mutateBody) {
    let nextUrl = url;
    let nextBody = body;
    if (isWatchtimeUrl(url)) nextUrl = mutateUrl(url);
    if (typeof body === "string" && body) {
      if (/(?:^|&)(et|cmt|docid|st)=/.test(body)) {
        nextBody = mutateBody(body);
      } else if (body.trim().charAt(0) === "{") {
        try {
          const obj = JSON.parse(body);
          mutateBody(obj);
          nextBody = JSON.stringify(obj);
        } catch {
          /* keep */
        }
      }
    }
    return { url: nextUrl, body: nextBody };
  }

  function rewriteWatchtimeRequest(url, body, seconds) {
    const sec = seconds == null ? 1 : seconds;
    return mutateWatchtimeRequest(
      url,
      body,
      (u) => rewriteWatchtimeUrl(u, sec),
      (b) => {
        if (typeof b === "string") return forceWatchQuery(b, sec);
        rewriteWatchTimeFields(b, 0, sec);
        return b;
      }
    );
  }

  function trimWatchtimeRequest(url, body, trim) {
    if (!(trim > 0)) return { url: url, body: body };
    return mutateWatchtimeRequest(
      url,
      body,
      (u) => trimWatchtimeUrl(u, trim),
      (b) => {
        if (typeof b === "string") {
          return applyWatchParamsToQuery(b, (sp) => trimWatchParams(sp, trim));
        }
        if (b && typeof b === "object") {
          const et = readWatchSeconds(b.et);
          if (et != null) b.et = Math.max(0, et - trim);
          const cmt = readWatchSeconds(b.cmt);
          if (cmt != null) b.cmt = Math.max(0, cmt - trim);
        }
        return b;
      }
    );
  }

  function stampWatchtimeVideo(url, body, videoId, seconds) {
    const rewritten = rewriteWatchtimeRequest(url, body, seconds);
    const stamp = (target) => {
      if (!target) return target;
      try {
        const abs = /^https?:/i.test(target);
        const u = abs
          ? new URL(target)
          : new URL(target, "https://www.youtube.com/");
        setWatchtimeDocId(u.searchParams, videoId);
        forceWatchParams(u.searchParams, seconds);
        if (abs) return u.toString();
        return u.pathname + u.search + u.hash;
      } catch {
        return target;
      }
    };
    let nextUrl = rewritten.url;
    let nextBody = rewritten.body;
    if (isWatchtimeUrl(nextUrl)) nextUrl = stamp(nextUrl);
    if (typeof nextBody === "string" && /(?:^|&)(et|cmt|docid|st)=/.test(nextBody)) {
      nextBody = applyWatchParamsToQuery(nextBody, (sp) => {
        setWatchtimeDocId(sp, videoId);
        forceWatchParams(sp, seconds);
      });
    }
    return { url: nextUrl, body: nextBody };
  }

  function shouldRewriteShortsWatchtime(
    kind,
    isEnabled,
    flagMap,
    videos,
    url,
    body,
    pathname
  ) {
    if (!isEnabled || kind !== "shorts") return false;
    if (!isWatchtimeUrl(url)) return false;
    const vid =
      extractWatchtimeVideoId(url, body) || extractVideoId(pathname || "");
    if (!vid || !videos) return false;
    const ch = videos[vid];
    return !!(ch && flagMap && flagMap[ch] === "t");
  }

  function ownerChannelFromWatchNext(node, depth) {
    if (!node || depth > 12) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const ch = ownerChannelFromWatchNext(item, depth + 1);
        if (ch) return ch;
      }
      return null;
    }
    if (typeof node !== "object") return null;
    if (node.videoSecondaryInfoRenderer) {
      return extractChannelIdFromData(node.videoSecondaryInfoRenderer);
    }
    if (node.reelPlayerHeaderRenderer) {
      return extractChannelIdFromData(node.reelPlayerHeaderRenderer);
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        const ch = ownerChannelFromWatchNext(value, depth + 1);
        if (ch) return ch;
      }
    }
    return null;
  }

  function indexYoutubeMedia(node, out, depth) {
    if (!out) out = { videos: {}, comments: {}, ownerHint: null };
    if (!node || depth > 22) return out;
    if (Array.isArray(node)) {
      for (const item of node) indexYoutubeMedia(item, out, depth + 1);
      return out;
    }
    if (typeof node !== "object") return out;

    const details = node.videoDetails;
    if (details && details.videoId) {
      const ch = pickUc(details.channelId) || extractChannelIdFromData(details);
      if (ch) out.videos[details.videoId] = ch;
    }

    const micro =
      node.playerMicroformatRenderer ||
      (node.microformat && node.microformat.playerMicroformatRenderer);
    if (micro) {
      const ch = pickUc(micro.externalChannelId) || pickUc(micro.channelId);
      const vid =
        micro.videoId ||
        (details && details.videoId) ||
        extractVideoId(JSON.stringify(micro).slice(0, 4000));
      if (ch && vid) out.videos[vid] = ch;
    }

    if (node.reelPlayerHeaderRenderer) {
      const ch = extractChannelIdFromData(node.reelPlayerHeaderRenderer);
      if (ch) out.ownerHint = ch;
    }

    if (node.currentVideoEndpoint) {
      const ep =
        node.currentVideoEndpoint.reelWatchEndpoint ||
        node.currentVideoEndpoint.watchEndpoint ||
        {};
      const vid = ep.videoId;
      if (vid && !out.videos[vid]) {
        const ch =
          (details && pickUc(details.channelId)) ||
          ownerChannelFromWatchNext(node.contents || node.playerOverlays || node, 0);
        if (ch) out.videos[vid] = ch;
      }
    }

    const videoObj =
      node.videoRenderer ||
      node.compactVideoRenderer ||
      node.gridVideoRenderer ||
      node.reelItemRenderer ||
      node.playlistVideoRenderer ||
      node.endScreenVideoRenderer;
    if (videoObj && videoObj.videoId) {
      const ch = extractChannelIdFromData(videoObj) || extractChannelIdFromData(node);
      if (ch) out.videos[videoObj.videoId] = ch;
    }

    if (node.lockupViewModel) {
      const ch = extractChannelIdFromData(node.lockupViewModel);
      const vid =
        extractVideoId(JSON.stringify(node.lockupViewModel).slice(0, 8000)) ||
        node.lockupViewModel.contentId;
      if (ch && vid) out.videos[vid] = ch;
    }

    if (node.shortsLockupViewModel) {
      const ch = extractChannelIdFromData(node.shortsLockupViewModel);
      const vid = extractVideoId(
        JSON.stringify(node.shortsLockupViewModel).slice(0, 8000)
      );
      if (ch && vid) out.videos[vid] = ch;
    }

    const commentObj =
      node.commentRenderer ||
      node.commentViewModel ||
      (node.commentThreadRenderer &&
        node.commentThreadRenderer.comment &&
        node.commentThreadRenderer.comment.commentRenderer);
    if (commentObj) {
      const ch = extractChannelIdFromData(commentObj) || extractChannelIdFromData(node);
      const cid = commentObj.commentId || commentObj.id;
      if (ch && cid) out.comments[cid] = ch;
    }

    for (const value of Object.values(node)) {
      indexYoutubeMedia(value, out, depth + 1);
    }
    return out;
  }

  function collectTextUcIds(text) {
    if (!text) return [];
    const out = [];
    const seen = new Set();
    const matches = String(text).match(UC_IN_TEXT_RE) || [];
    for (const id of matches) {
      if (!seen.has(id) && isUcId(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  const USAGE_KEEP_DAYS = 0;

  function localDayKey(now) {
    const d = now instanceof Date ? now : new Date(now || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function emptyDayUsage() {
    return { watched: {}, blocked: {} };
  }

  function emptyUsageSafe() {
    return {
      totalWatched: 0,
      totalBlocked: 0,
      todayKey: "",
      todayWatched: 0,
      todayBlocked: 0,
      firstDay: "",
      updatedAt: 0,
    };
  }

  function pruneUsageDays(days, keepDays) {
    if (keepDays == null || keepDays <= 0) return days;
    const keys = Object.keys(days || {}).sort();
    while (keys.length > keepDays) {
      delete days[keys.shift()];
    }
    return days;
  }

  function addUsageIds(days, dayKey, bucket, ids, keepDays) {
    const store = days && typeof days === "object" ? days : {};
    if (!dayKey || (bucket !== "watched" && bucket !== "blocked")) return store;
    if (!store[dayKey]) store[dayKey] = emptyDayUsage();
    if (!store[dayKey][bucket]) store[dayKey][bucket] = {};
    for (const id of ids || []) {
      if (id) store[dayKey][bucket][String(id)] = 1;
    }
    if (keepDays > 0) pruneUsageDays(store, keepDays);
    return store;
  }

  function countUsageBucket(row, bucket) {
    if (!row || !row[bucket] || typeof row[bucket] !== "object") return 0;
    return Object.keys(row[bucket]).length;
  }

  function summarizeUsage(days, todayKey) {
    const store = days && typeof days === "object" ? days : {};
    const keys = Object.keys(store).sort();
    let watchedSum = 0;
    let blockedSum = 0;
    let activeDays = 0;
    for (const key of keys) {
      const watched = countUsageBucket(store[key], "watched");
      const blocked = countUsageBucket(store[key], "blocked");
      if (watched || blocked) {
        watchedSum += watched;
        blockedSum += blocked;
        activeDays += 1;
      }
    }
    const today = store[todayKey] || emptyDayUsage();
    return {
      todayKey: todayKey || "",
      todayWatched: countUsageBucket(today, "watched"),
      todayBlocked: countUsageBucket(today, "blocked"),
      totalWatched: watchedSum,
      totalBlocked: blockedSum,
      avgWatched: activeDays ? watchedSum / activeDays : 0,
      avgBlocked: activeDays ? blockedSum / activeDays : 0,
      days: activeDays,
    };
  }

  function bumpUsageSafe(safe, todayKey, addedWatched, addedBlocked) {
    const next = Object.assign(emptyUsageSafe(), safe && typeof safe === "object" ? safe : {});
    const w = Math.max(0, Number(addedWatched) || 0);
    const b = Math.max(0, Number(addedBlocked) || 0);
    if (todayKey && next.todayKey !== todayKey) {
      next.todayKey = todayKey;
      next.todayWatched = 0;
      next.todayBlocked = 0;
    }
    next.totalWatched = (Number(next.totalWatched) || 0) + w;
    next.totalBlocked = (Number(next.totalBlocked) || 0) + b;
    next.todayWatched = (Number(next.todayWatched) || 0) + w;
    next.todayBlocked = (Number(next.todayBlocked) || 0) + b;
    if (todayKey && !next.firstDay) next.firstDay = todayKey;
    next.updatedAt = Date.now();
    return next;
  }

  function mergeUsageSafe(summary, safe) {
    const snap = summary && typeof summary === "object" ? summary : summarizeUsage({}, "");
    const hold = safe && typeof safe === "object" ? safe : emptyUsageSafe();
    const out = Object.assign({}, snap);
    out.totalWatched = Math.max(snap.totalWatched || 0, Number(hold.totalWatched) || 0);
    out.totalBlocked = Math.max(snap.totalBlocked || 0, Number(hold.totalBlocked) || 0);
    if (!hold.todayKey || hold.todayKey === snap.todayKey) {
      out.todayWatched = Math.max(snap.todayWatched || 0, Number(hold.todayWatched) || 0);
      out.todayBlocked = Math.max(snap.todayBlocked || 0, Number(hold.todayBlocked) || 0);
    }
    if (hold.firstDay && !out.firstDay) out.firstDay = hold.firstDay;
    out.days = Math.max(
      snap.days || 0,
      out.totalWatched || out.totalBlocked ? 1 : 0
    );
    return out;
  }

  function formatUsageNumber(n) {
    const x = Number(n) || 0;
    if (Math.abs(x - Math.round(x)) < 0.05) return String(Math.round(x));
    return x.toFixed(1);
  }

  function parseVersionParts(value) {
    return String(value || "")
      .trim()
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });
  }

  function compareVersions(a, b) {
    const pa = parseVersionParts(a);
    const pb = parseVersionParts(b);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const da = pa[i] || 0;
      const db = pb[i] || 0;
      if (da > db) return 1;
      if (da < db) return -1;
    }
    return 0;
  }

  function parseGithubRepo(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    const fromUrl = raw.match(
      /(?:github\.com[:/]+|cdn\.jsdelivr\.net\/gh\/|raw\.githubusercontent\.com\/)([^/]+)\/([^/#?\s]+)/i
    );
    const fromShort = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
    const m = fromUrl || fromShort;
    if (!m) return null;
    const owner = m[1];
    const repo = String(m[2]).replace(/\.git$/i, "");
    if (!owner || !repo || owner === "http:" || owner === "https:") return null;
    return { owner: owner, repo: repo };
  }

  function githubRepoSlug(repo) {
    if (!repo || !repo.owner || !repo.repo) return "";
    return repo.owner + "/" + repo.repo;
  }

  function updateFeedUrls(repo) {
    const slug = githubRepoSlug(repo);
    if (!slug) return null;
    const o = repo.owner;
    const r = repo.repo;
    return {
      json: [
        "https://raw.githubusercontent.com/" + o + "/" + r + "/main/updates.json",
        "https://cdn.jsdelivr.net/gh/" + o + "/" + r + "@main/updates.json",
      ],
      release: "https://api.github.com/repos/" + o + "/" + r + "/releases/latest",
      zipRaw:
        "https://raw.githubusercontent.com/" +
        o +
        "/" +
        r +
        "/main/kpixel-channel-filter.zip",
      zipCdn:
        "https://cdn.jsdelivr.net/gh/" + o + "/" + r + "@main/kpixel-channel-filter.zip",
      zipRelease:
        "https://github.com/" +
        o +
        "/" +
        r +
        "/releases/latest/download/kpixel-channel-filter.zip",
      page: "https://github.com/" + o + "/" + r,
    };
  }

  function resolveUpdateZip(zip, feeds) {
    const value = String(zip || "").trim();
    if (!value) return (feeds && (feeds.zipRelease || feeds.zipCdn || feeds.zipRaw)) || "";
    if (/^https?:\/\//i.test(value)) return value;
    if (!feeds) return value;
    return String(feeds.zipRaw || "").replace(/kpixel-channel-filter\.zip$/i, value.replace(/^\//, ""));
  }

  function parseUpdateManifest(data, feeds) {
    if (!data || typeof data !== "object") return null;
    if (data.tag_name || Array.isArray(data.assets)) {
      const version = String(data.tag_name || data.name || "").replace(/^v/i, "");
      if (!version) return null;
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const zipAsset =
        assets.find((row) => /kpixel.*\.zip$/i.test(row && row.name)) ||
        assets.find((row) => /\.zip$/i.test(row && row.name));
      return {
        version: version,
        notes: String(data.body || "").trim(),
        zip:
          (zipAsset && zipAsset.browser_download_url) ||
          resolveUpdateZip("", feeds),
        page: data.html_url || (feeds && feeds.page) || "",
      };
    }
    const version = String(data.version || "").replace(/^v/i, "");
    if (!version) return null;
    return {
      version: version,
      notes: String(data.notes || data.changelog || "").trim(),
      zip: resolveUpdateZip(data.zip || data.download || "", feeds),
      page: data.page || data.url || (feeds && feeds.page) || "",
    };
  }

  const api = {
    UC_RE,
    ITEM_SELECTORS,
    COMMENT_SELECTORS,
    POST_SELECTORS,
    SHORTS_SELECTORS,
    isUcId,
    parseFlagResponse,
    shouldHideFlag,
    getPageKind,
    shouldFilterSurface,
    surfaceForElement,
    normalizeHandle,
    parseChannelHref,
    extractVideoId,
    extractPayloadVideoId,
    extractChannelIdFromData,
    collectTextUcIds,
    payloadSurface,
    filterYoutubePayload,
    collectChannelIdsFromPayload,
    shouldInterceptYoutubeiUrl,
    shouldIngestYoutubeiUrl,
    shouldDropPayloadItem,
    shouldSpliceSequenceItem,
    spliceVideoFromNode,
    nextKeptShortId,
    indexYoutubeMedia,
    shouldRewriteShortsWatchtime,
    isWatchtimeUrl,
    extractWatchtimeVideoId,
    formatWatchSeconds,
    sineWatchSeconds,
    sineUnit,
    forceWatchParams,
    forceWatchQuery,
    forceOneSecondWatchParams,
    forceOneSecondWatchQuery,
    trimWatchParams,
    trimWatchtimeUrl,
    trimWatchtimeRequest,
    stampWatchtimeVideo,
    rewriteWatchtimeUrl,
    rewriteWatchtimeRequest,
    T_SHORT_WATCH_MIN,
    T_SHORT_WATCH_MAX,
    NEIGHBOR_TRIM_MAX,
    USAGE_KEEP_DAYS,
    localDayKey,
    emptyDayUsage,
    emptyUsageSafe,
    addUsageIds,
    countUsageBucket,
    summarizeUsage,
    bumpUsageSafe,
    mergeUsageSafe,
    formatUsageNumber,
    parseVersionParts,
    compareVersions,
    parseGithubRepo,
    githubRepoSlug,
    updateFeedUrls,
    resolveUpdateZip,
    parseUpdateManifest,
  };

  return api;
})();
if (typeof module !== "undefined" && module.exports) {
  module.exports = KPixel;
}
