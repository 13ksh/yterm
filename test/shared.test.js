const test = require("node:test");
const assert = require("node:assert/strict");
const KPixel = require("../shared.js");

test("isUcId accepts standard channel ids", () => {
  assert.equal(KPixel.isUcId("UCXuqSBlHAE6Xw-yeJA0Tunw"), true);
  assert.equal(KPixel.isUcId("UC-lHJZR3Gqxm24_Vd_AJ5Yw"), true);
  assert.equal(KPixel.isUcId("UCshort"), false);
  assert.equal(KPixel.isUcId("PLplaylistxxxxxxxxxxxxxxxx"), false);
});

test("parseFlagResponse maps t/f only", () => {
  assert.equal(KPixel.parseFlagResponse("t"), "t");
  assert.equal(KPixel.parseFlagResponse("T\n"), "t");
  assert.equal(KPixel.parseFlagResponse("f"), "f");
  assert.equal(KPixel.parseFlagResponse("invalid"), "unknown");
  assert.equal(KPixel.parseFlagResponse(""), "unknown");
  assert.equal(KPixel.shouldHideFlag("t"), true);
  assert.equal(KPixel.shouldHideFlag("f"), false);
  assert.equal(KPixel.shouldHideFlag("unknown"), false);
});

test("search pages never filter any surface", () => {
  assert.equal(KPixel.getPageKind("/results"), "search");
  assert.equal(KPixel.getPageKind("/results?search_query=foo"), "search");
  for (const surface of ["video", "shorts", "comment", "post"]) {
    assert.equal(KPixel.shouldFilterSurface("search", surface), false);
  }
});

test("feeds hide videos shorts posts and comments", () => {
  assert.equal(KPixel.getPageKind("/"), "home");
  assert.equal(KPixel.getPageKind("/feed/subscriptions"), "feed");
  assert.equal(KPixel.getPageKind("/shorts/abc"), "shorts");
  assert.equal(KPixel.shouldFilterSurface("home", "video"), true);
  assert.equal(KPixel.shouldFilterSurface("feed", "shorts"), true);
  assert.equal(KPixel.shouldFilterSurface("shorts", "shorts"), true);
  assert.equal(KPixel.shouldFilterSurface("watch", "comment"), true);
  assert.equal(KPixel.shouldFilterSurface("watch", "video"), true);
});

test("channel pages keep videos and posts, still filter comments", () => {
  assert.equal(KPixel.getPageKind("/@LinusTechTips"), "channel");
  assert.equal(KPixel.getPageKind("/channel/UCXuqSBlHAE6Xw-yeJA0Tunw/videos"), "channel");
  assert.equal(KPixel.shouldFilterSurface("channel", "video"), false);
  assert.equal(KPixel.shouldFilterSurface("channel", "post"), false);
  assert.equal(KPixel.shouldFilterSurface("channel", "shorts"), false);
  assert.equal(KPixel.shouldFilterSurface("channel", "comment"), true);
});

test("parseChannelHref reads UC ids and handles", () => {
  assert.deepEqual(
    KPixel.parseChannelHref("https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw"),
    { channelId: "UCXuqSBlHAE6Xw-yeJA0Tunw", handle: null }
  );
  assert.deepEqual(KPixel.parseChannelHref("/@MrBeast"), {
    channelId: null,
    handle: "MrBeast",
  });
});

test("extractChannelIdFromData prefers owner browseId", () => {
  const data = {
    videoId: "dQw4w9wg",
    shortBylineText: {
      runs: [
        {
          text: "Someone",
          navigationEndpoint: {
            browseEndpoint: { browseId: "UCXuqSBlHAE6Xw-yeJA0Tunw" },
          },
        },
      ],
    },
  };
  assert.equal(
    KPixel.extractChannelIdFromData(data),
    "UCXuqSBlHAE6Xw-yeJA0Tunw"
  );
});

test("extractChannelIdFromData reads comment authorEndpoint", () => {
  const data = {
    authorEndpoint: {
      browseEndpoint: { browseId: "UC-lHJZR3Gqxm24_Vd_AJ5Yw" },
    },
  };
  assert.equal(
    KPixel.extractChannelIdFromData(data),
    "UC-lHJZR3Gqxm24_Vd_AJ5Yw"
  );
});

test("surfaceForElement classifies comments posts and shorts", () => {
  const comment = { matches: (s) => s.includes("comment-thread") };
  const post = { matches: (s) => s.includes("post-renderer") };
  const short = { matches: (s) => s.includes("reel-video") };
  const video = { matches: () => false, querySelector: () => null };
  assert.equal(KPixel.surfaceForElement(comment), "comment");
  assert.equal(KPixel.surfaceForElement(post), "post");
  assert.equal(KPixel.surfaceForElement(short), "shorts");
  assert.equal(KPixel.surfaceForElement(video), "video");
});
