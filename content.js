// Isolated-world bridge only. Page-world inject.js does the hiding.
(() => {
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
    if (msg.type !== "lookup") return;
    try {
      const res = await chrome.runtime.sendMessage({
        type: "LOOKUP",
        channelIds: msg.channelIds,
      });
      postToPage({
        type: "flags",
        req: msg.req,
        results: (res && res.results) || {},
        enabled: res && res.enabled,
      });
    } catch {
      postToPage({ type: "flags", req: msg.req, results: {} });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) {
      postToPage({
        type: "enabled",
        enabled: changes.enabled.newValue !== false,
      });
    }
    if (changes.forceT || changes.cache) {
      chrome.runtime.sendMessage({ type: "GET_FLAGS" }, (res) => {
        if (res) {
          postToPage({
            type: "seed",
            flags: res.flags || {},
            enabled: res.enabled,
          });
        }
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "PAGE_STATS") {
      sendResponse({
        hidden: document.querySelectorAll("[data-kpixel-hide='1']").length,
        kind: location.pathname,
      });
      return false;
    }
    if (message && message.type === "RESCAN") {
      postToPage({ type: "rescan" });
      sendResponse({ ok: true });
    }
  });
})();
