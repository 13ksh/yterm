const test = require("node:test");
const assert = require("node:assert/strict");
const KPixel = require("../shared.js");

test("filterYoutubePayload drops t videos on home but not search", () => {
  const tId = "UCXuqSBlHAE6Xw-yeJA0Tunw";
  const fId = "UC-lHJZR3Gqxm24_Vd_AJ5Yw";
  const payload = {
    contents: [
      {
        videoRenderer: {
          videoId: "aaa",
          ownerText: {
            runs: [
              {
                navigationEndpoint: {
                  browseEndpoint: { browseId: tId },
                },
              },
            ],
          },
        },
      },
      {
        videoRenderer: {
          videoId: "bbb",
          ownerText: {
            runs: [
              {
                navigationEndpoint: {
                  browseEndpoint: { browseId: fId },
                },
              },
            ],
          },
        },
      },
    ],
  };
  const flags = { [tId]: "t", [fId]: "f" };
  const home = JSON.parse(JSON.stringify(payload));
  KPixel.filterYoutubePayload(home, flags, "home");
  assert.equal(home.contents.length, 1);
  assert.equal(home.contents[0].videoRenderer.videoId, "bbb");

  const search = JSON.parse(JSON.stringify(payload));
  KPixel.filterYoutubePayload(search, flags, "search");
  assert.equal(search.contents.length, 2);
});

test("filterYoutubePayload drops t comments", () => {
  const tId = "UCXuqSBlHAE6Xw-yeJA0Tunw";
  const data = {
    comments: [
      {
        commentThreadRenderer: {
          comment: {
            commentRenderer: {
              authorEndpoint: { browseEndpoint: { browseId: tId } },
            },
          },
        },
      },
    ],
  };
  KPixel.filterYoutubePayload(data, { [tId]: "t" }, "watch");
  assert.equal(data.comments.length, 0);
});

test("shouldInterceptYoutubeiUrl skips search, player, and current reel watch", () => {
  assert.equal(
    KPixel.shouldInterceptYoutubeiUrl(
      "https://www.youtube.com/youtubei/v1/browse"
    ),
    true
  );
  assert.equal(
    KPixel.shouldInterceptYoutubeiUrl("/youtubei/v1/next?prettyPrint=false"),
    true
  );
  assert.equal(
    KPixel.shouldInterceptYoutubeiUrl(
      "https://www.youtube.com/youtubei/v1/search"
    ),
    false
  );
  assert.equal(
    KPixel.shouldInterceptYoutubeiUrl(
      "https://www.youtube.com/youtubei/v1/player"
    ),
    false
  );
  assert.equal(
    KPixel.shouldInterceptYoutubeiUrl(
      "https://www.youtube.com/youtubei/v1/reel/reel_item_watch"
    ),
    false
  );
  assert.equal(
    KPixel.shouldInterceptYoutubeiUrl(
      "https://www.youtube.com/youtubei/v1/reel/reel_watch_sequence"
    ),
    true
  );
});

test("shouldIngestYoutubeiUrl keeps player and reel maps without filtering them", () => {
  assert.equal(
    KPixel.shouldIngestYoutubeiUrl(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
    ),
    true
  );
  assert.equal(
    KPixel.shouldIngestYoutubeiUrl(
      "https://www.youtube.com/youtubei/v1/reel/reel_item_watch"
    ),
    true
  );
  assert.equal(
    KPixel.shouldIngestYoutubeiUrl("https://www.youtube.com/youtubei/v1/search"),
    false
  );
});

test("shorts page drops t reel items so people never see them", () => {
  const tId = "UCmmlHsRZzocU9UrXM2mcsng";
  const fId = "UCXuqSBlHAE6Xw-yeJA0Tunw";
  const data = {
    contents: [
      {
        reelItemRenderer: {
          videoId: "shortOne11",
          navigationEndpoint: {
            reelWatchEndpoint: { videoId: "shortOne11" },
          },
          owner: { browseId: fId },
        },
      },
      {
        reelItemRenderer: {
          videoId: "OB1uQrVzO9I",
          navigationEndpoint: {
            reelWatchEndpoint: { videoId: "OB1uQrVzO9I" },
          },
          owner: { browseId: tId },
        },
      },
      {
        reelItemRenderer: {
          videoId: "shortThree",
          navigationEndpoint: {
            reelWatchEndpoint: { videoId: "shortThree" },
          },
          owner: { browseId: fId },
        },
      },
    ],
  };
  const dropped = {};
  KPixel.filterYoutubePayload(data, { [tId]: "t", [fId]: "f" }, "shorts", dropped);
  assert.equal(data.contents.length, 2);
  assert.equal(data.contents[0].reelItemRenderer.videoId, "shortOne11");
  assert.equal(data.contents[1].reelItemRenderer.videoId, "shortThree");
  assert.equal(dropped.OB1uQrVzO9I, tId);
});

test("hiding the middle short keeps the previous clip as the neighbor", () => {
  const ids = ["oneShort", "twoShort", "thrShort"];
  const dropped = (id) => id === "twoShort";
  assert.equal(KPixel.nextKeptShortId(ids, "twoShort", dropped), "thrShort");
  assert.equal(
    KPixel.nextKeptShortId(ids, "twoShort", (id) => id === "twoShort" || id === "thrShort"),
    "oneShort"
  );

  const seq = {
    contents: [
      { reelItemRenderer: { videoId: "oneShort" } },
      { reelItemRenderer: { videoId: "twoShort" } },
      { reelItemRenderer: { videoId: "thrShort" } },
    ],
  };
  KPixel.spliceVideoFromNode(seq, "twoShort", 0, new Set());
  const kept = seq.contents.map((row) => row.reelItemRenderer.videoId);
  assert.deepEqual(kept, ["oneShort", "thrShort"]);
  assert.equal(kept[kept.indexOf("thrShort") - 1], "oneShort");
});
