(() => {
  if (window.__kpixelInjected) return;
  window.__kpixelInjected = true;

  const flags = Object.create(null);
  let enabled = true;
  let seq = 0;
  const waiters = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "kpixel-cs") return;
    if (msg.type === "seed" || msg.type === "flags") {
      if (msg.flags) Object.assign(flags, msg.flags);
      if (msg.results) Object.assign(flags, msg.results);
      const waiter = waiters.get(msg.req);
      if (waiter) waiter();
    }
    if (msg.type === "enabled") enabled = msg.enabled !== false;
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
    if (kind === "search") return text;
    await lookup(KPixel.collectChannelIdsFromPayload(data));
    KPixel.filterYoutubePayload(data, flags, kind);
    return JSON.stringify(data);
  }

  function filterObject(data) {
    if (!enabled || !data || pageKind() === "search") return data;
    try {
      const ids = KPixel.collectChannelIdsFromPayload(data);
      lookup(ids);
      KPixel.filterYoutubePayload(data, flags, pageKind());
    } catch {
      /* keep original */
    }
    return data;
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (
      !enabled ||
      !KPixel.shouldInterceptYoutubeiUrl(url) ||
      pageKind() === "search"
    ) {
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
      },
    });
  }

  if (!("ytInitialData" in window)) {
    trapInitialData("ytInitialData");
  } else {
    filterObject(window.ytInitialData);
  }
})();
