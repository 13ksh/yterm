const test = require("node:test");
const assert = require("node:assert/strict");
const KPixel = require("../shared.js");

test("shorts feed hides t cards from the person", () => {
  assert.equal(KPixel.shouldFilterSurface("shorts", "shorts"), true);
  assert.equal(KPixel.shouldFilterSurface("shorts", "comment"), true);
  assert.equal(KPixel.shouldFilterSurface("home", "shorts"), true);
});

test("forceOneSecondWatchQuery sets et and cmt to 1.000", () => {
  const q = KPixel.forceOneSecondWatchQuery(
    "ns=yt&el=shortspage&docid=abcdefghijk&st=0.000&et=12.450&cmt=12.450&len=18.000"
  );
  const sp = new URLSearchParams(q);
  assert.equal(sp.get("et"), "1.000");
  assert.equal(sp.get("cmt"), "1.000");
  assert.equal(sp.get("st"), "0.000");
  assert.equal(sp.get("docid"), "abcdefghijk");
  assert.equal(sp.get("len"), "18.000");
});

test("rewriteWatchtimeUrl rewrites range et format", () => {
  const url =
    "https://www.youtube.com/api/stats/watchtime?docid=abcdefghijk&st=0.000:0.000&et=0.000:8.200&cmt=8.200";
  const next = KPixel.rewriteWatchtimeUrl(url);
  const sp = new URL(next).searchParams;
  assert.equal(sp.get("et"), "0.000:1.000");
  assert.equal(sp.get("cmt"), "1.000");
});

test("extractWatchtimeVideoId reads docid", () => {
  assert.equal(
    KPixel.extractWatchtimeVideoId(
      "https://s.youtube.com/api/stats/watchtime?docid=jNQXAC9IVRw&et=3",
      ""
    ),
    "jNQXAC9IVRw"
  );
});

test("rewriteWatchtimeRequest rewrites POST body", () => {
  const out = KPixel.rewriteWatchtimeRequest(
    "https://www.youtube.com/api/stats/watchtime",
    "docid=jNQXAC9IVRw&et=20.1&cmt=20.1&st=0"
  );
  const sp = new URLSearchParams(out.body);
  assert.equal(sp.get("et"), "1.000");
  assert.equal(sp.get("cmt"), "1.000");
  assert.equal(KPixel.isWatchtimeUrl(out.url), true);
});

test("forceOneSecondWatchQuery collapses multi-segment et", () => {
  const q = KPixel.forceOneSecondWatchQuery("st=0.000,4.000&et=4.000,18.200&cmt=18.200");
  const sp = new URLSearchParams(q);
  assert.equal(sp.get("st"), "0.000");
  assert.equal(sp.get("et"), "1.000");
  assert.equal(sp.get("cmt"), "1.000");
});

test("indexYoutubeMedia pairs current video with secondary owner", () => {
  const data = {
    currentVideoEndpoint: { watchEndpoint: { videoId: "jNQXAC9IVRw" } },
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              { videoPrimaryInfoRenderer: {} },
              {
                videoSecondaryInfoRenderer: {
                  subscribeButton: {
                    subscribeButtonRenderer: {
                      channelId: "UC4QobU6STFB0P71PMvOGN5A",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  };
  const indexed = KPixel.indexYoutubeMedia(data, null, 0);
  assert.equal(indexed.videos.jNQXAC9IVRw, "UC4QobU6STFB0P71PMvOGN5A");
});

test("indexYoutubeMedia maps shorts player videoDetails to channel", () => {
  const player = {
    videoDetails: {
      videoId: "OB1uQrVzO9I",
      channelId: "UCmmlHsRZzocU9UrXM2mcsng",
      author: "C Daily",
    },
    microformat: {
      playerMicroformatRenderer: {
        externalChannelId: "UCmmlHsRZzocU9UrXM2mcsng",
      },
    },
  };
  const indexed = KPixel.indexYoutubeMedia(player, null, 0);
  assert.equal(indexed.videos.OB1uQrVzO9I, "UCmmlHsRZzocU9UrXM2mcsng");
});

test("indexYoutubeMedia reads reel overlay owner and nested player", () => {
  const reel = {
    overlay: {
      reelPlayerOverlayRenderer: {
        reelPlayerHeaderRenderer: {
          channelNavigationEndpoint: {
            browseEndpoint: { browseId: "UCmmlHsRZzocU9UrXM2mcsng" },
          },
        },
      },
    },
    playerResponse: {
      videoDetails: {
        videoId: "OB1uQrVzO9I",
        channelId: "UCmmlHsRZzocU9UrXM2mcsng",
      },
    },
  };
  const indexed = KPixel.indexYoutubeMedia(reel, null, 0);
  assert.equal(indexed.videos.OB1uQrVzO9I, "UCmmlHsRZzocU9UrXM2mcsng");
  assert.equal(indexed.ownerHint, "UCmmlHsRZzocU9UrXM2mcsng");
});

test("collectChannelIdsFromPayload includes player videoDetails", () => {
  const ids = KPixel.collectChannelIdsFromPayload({
    videoDetails: {
      videoId: "OB1uQrVzO9I",
      channelId: "UCmmlHsRZzocU9UrXM2mcsng",
    },
  });
  assert.deepEqual(ids, ["UCmmlHsRZzocU9UrXM2mcsng"]);
});

test("rewriteWatchtimeUrl can target a sine-sampled duration", () => {
  const url =
    "https://www.youtube.com/api/stats/watchtime?docid=abcdefghijk&st=0.000&et=8.200&cmt=8.200";
  const next = KPixel.rewriteWatchtimeUrl(url, 1.234);
  const sp = new URL(next).searchParams;
  assert.equal(sp.get("et"), "1.234");
  assert.equal(sp.get("cmt"), "1.234");
});

test("sineWatchSeconds peaks at the center of 0.8–1.6", () => {
  const mid = KPixel.sineWatchSeconds(0.8, 1.6, () => 0.5);
  assert.ok(Math.abs(mid - 1.2) < 1e-9);
  const lo = KPixel.sineWatchSeconds(0.8, 1.6, () => 0.02);
  const hi = KPixel.sineWatchSeconds(0.8, 1.6, () => 0.98);
  assert.ok(lo > 0.8 && lo < 1.05);
  assert.ok(hi > 1.35 && hi < 1.6);
  for (let i = 0; i < 40; i++) {
    const s = KPixel.sineWatchSeconds(0.8, 1.6, () => (i + 0.5) / 40);
    assert.ok(s >= 0.8 && s <= 1.6);
  }
});

test("trimWatchtimeRequest shortens the following clip by at most 0.2s", () => {
  const out = KPixel.trimWatchtimeRequest(
    "https://www.youtube.com/api/stats/watchtime?docid=nextvidid1&et=10.400&cmt=10.400",
    "",
    KPixel.NEIGHBOR_TRIM_MAX
  );
  const sp = new URL(out.url).searchParams;
  assert.equal(sp.get("et"), "10.200");
  assert.equal(sp.get("cmt"), "10.200");
  assert.equal(KPixel.NEIGHBOR_TRIM_MAX, 0.2);
});

test("stampWatchtimeVideo swaps docid and forces sine seconds", () => {
  const out = KPixel.stampWatchtimeVideo(
    "https://s.youtube.com/api/stats/watchtime?ns=yt&el=shortspage&docid=prevvideoid&et=4&cmt=4",
    "",
    "OB1uQrVzO9I",
    1.111
  );
  const sp = new URL(out.url).searchParams;
  assert.equal(sp.get("docid"), "OB1uQrVzO9I");
  assert.equal(sp.get("et"), "1.111");
  assert.equal(sp.get("cmt"), "1.111");
});

test("shouldRewriteShortsWatchtime only for t shorts watchtime pings", () => {
  const ch = "UCmmlHsRZzocU9UrXM2mcsng";
  const vid = "OB1uQrVzO9I";
  const url =
    "https://s.youtube.com/api/stats/watchtime?ns=yt&el=shortspage&docid=" +
    vid +
    "&et=9.900&cmt=9.900";
  const videos = { [vid]: ch };
  assert.equal(
    KPixel.shouldRewriteShortsWatchtime(
      "shorts",
      true,
      { [ch]: "t" },
      videos,
      url,
      "",
      "/shorts/" + vid
    ),
    true
  );
  assert.equal(
    KPixel.shouldRewriteShortsWatchtime(
      "shorts",
      true,
      { [ch]: "f" },
      videos,
      url,
      "",
      "/shorts/" + vid
    ),
    false
  );
  assert.equal(
    KPixel.shouldRewriteShortsWatchtime(
      "watch",
      true,
      { [ch]: "t" },
      videos,
      url,
      "",
      "/watch?v=" + vid
    ),
    false
  );
  assert.equal(
    KPixel.shouldRewriteShortsWatchtime(
      "shorts",
      true,
      { [ch]: "t" },
      videos,
      "https://www.youtube.com/youtubei/v1/player",
      JSON.stringify({ videoId: vid }),
      "/shorts/" + vid
    ),
    false
  );
});
