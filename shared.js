/**
 * Shared helpers for the KPixel YouTube filter.
 * Works in the extension, Node tests, and the preview demo.
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
    /(owner|author|byline|channel|uploader|creator|postauthor)/i;

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

  function extractChannelIdFromData(data, depth) {
    if (data == null) return null;
    if (typeof data === "string") return pickUc(data);
    if (typeof data !== "object" || depth > 12) return null;

    const direct =
      pickUc(data.channelId) ||
      pickUc(data.externalChannelId) ||
      pickUc(data.authorChannelId) ||
      pickUc(data.channel_id);
    if (direct) return direct;

    const browse =
      pickUc(data.browseId) ||
      pickUc(data.browseEndpoint && data.browseEndpoint.browseId);
    if (browse) return browse;

    const paths = [
      data.ownerText &&
        data.ownerText.runs &&
        data.ownerText.runs[0] &&
        data.ownerText.runs[0].navigationEndpoint &&
        data.ownerText.runs[0].navigationEndpoint.browseEndpoint &&
        data.ownerText.runs[0].navigationEndpoint.browseEndpoint.browseId,
      data.shortBylineText &&
        data.shortBylineText.runs &&
        data.shortBylineText.runs[0] &&
        data.shortBylineText.runs[0].navigationEndpoint &&
        data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint &&
        data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId,
      data.longBylineText &&
        data.longBylineText.runs &&
        data.longBylineText.runs[0] &&
        data.longBylineText.runs[0].navigationEndpoint &&
        data.longBylineText.runs[0].navigationEndpoint.browseEndpoint &&
        data.longBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId,
      data.authorText &&
        data.authorText.runs &&
        data.authorText.runs[0] &&
        data.authorText.runs[0].navigationEndpoint &&
        data.authorText.runs[0].navigationEndpoint.browseEndpoint &&
        data.authorText.runs[0].navigationEndpoint.browseEndpoint.browseId,
      data.authorEndpoint &&
        data.authorEndpoint.browseEndpoint &&
        data.authorEndpoint.browseEndpoint.browseId,
      data.navigationEndpoint &&
        data.navigationEndpoint.browseEndpoint &&
        data.navigationEndpoint.browseEndpoint.browseId,
      data.owner &&
        data.owner.videoOwnerRenderer &&
        data.owner.videoOwnerRenderer.navigationEndpoint &&
        data.owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint &&
        data.owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint.browseId,
    ];
    for (const p of paths) {
      const id = pickUc(p);
      if (id) return id;
    }

    return walkForOwnerId(data, 0, false);
  }

  function walkForOwnerId(node, depth, inOwnerContext) {
    if (node == null || depth > 10) return null;
    if (typeof node === "string") {
      return inOwnerContext ? pickUc(node) : null;
    }
    if (typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walkForOwnerId(item, depth + 1, inOwnerContext);
        if (found) return found;
      }
      return null;
    }

    for (const [key, value] of Object.entries(node)) {
      const ownerKey = OWNER_KEY_RE.test(key);
      const ctx = inOwnerContext || OWNER_CONTEXT_RE.test(key);
      if (ownerKey && typeof value === "string") {
        const id = pickUc(value);
        if (id) return id;
      }
      if (ctx || ownerKey) {
        const found = walkForOwnerId(value, depth + 1, true);
        if (found) return found;
      }
    }
    return null;
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
  };

  root.KPixel = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
