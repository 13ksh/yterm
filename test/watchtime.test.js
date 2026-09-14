const test = require("node:test");
const assert = require("node:assert/strict");
const KPixel = require("../shared.js");

test("shorts feed does not hide shorts cards so 1s watch can fire", () => {
  assert.equal(KPixel.shouldFilterSurface("shorts", "shorts"), false);
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
