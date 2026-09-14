/**
 * Shared helpers for the KPixel YouTube filter.
 */
(function (root) {
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

  function filterYoutubePayload(data, flags, pageKind) {
    if (!data || typeof data !== "object" || !flags) return data;
    if (pageKind === "search") return data;
    walkFilter(data, flags, pageKind);
    return data;
  }

  function walkFilter(node, flags, pageKind) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const el = node[i];
        if (shouldDropPayloadItem(el, flags, pageKind)) {
          node.splice(i, 1);
          continue;
        }
        walkFilter(el, flags, pageKind);
        if (isEmptyShelf(el)) node.splice(i, 1);
      }
      return;
    }
    for (const value of Object.values(node)) {
      walkFilter(value, flags, pageKind);
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
    return u.includes("/youtubei/v1/");
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
    extractChannelIdFromData,
    collectTextUcIds,
    payloadSurface,
    filterYoutubePayload,
    collectChannelIdsFromPayload,
    shouldInterceptYoutubeiUrl,
    shouldDropPayloadItem,
  };

  root.KPixel = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
