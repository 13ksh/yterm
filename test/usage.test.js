const test = require("node:test");
const assert = require("node:assert/strict");
const KPixel = require("../shared.js");

test("localDayKey uses local calendar date", () => {
  assert.equal(KPixel.localDayKey(new Date(2026, 8, 14, 7, 30)), "2026-09-14");
});

test("addUsageIds counts unique videos per day", () => {
  const days = {};
  KPixel.addUsageIds(days, "2026-09-14", "watched", ["aaa", "bbb", "aaa"]);
  KPixel.addUsageIds(days, "2026-09-14", "blocked", ["ccc"]);
  KPixel.addUsageIds(days, "2026-09-14", "blocked", ["ccc", "ddd"]);
  assert.equal(KPixel.countUsageBucket(days["2026-09-14"], "watched"), 2);
  assert.equal(KPixel.countUsageBucket(days["2026-09-14"], "blocked"), 2);
});

test("summarizeUsage reports today and daily averages", () => {
  const days = {};
  KPixel.addUsageIds(days, "2026-09-12", "watched", ["a", "b"]);
  KPixel.addUsageIds(days, "2026-09-12", "blocked", ["x"]);
  KPixel.addUsageIds(days, "2026-09-13", "watched", ["c", "d", "e", "f"]);
  KPixel.addUsageIds(days, "2026-09-13", "blocked", ["y", "z"]);
  KPixel.addUsageIds(days, "2026-09-14", "watched", ["g"]);
  KPixel.addUsageIds(days, "2026-09-14", "blocked", ["q", "r", "s"]);
  const sum = KPixel.summarizeUsage(days, "2026-09-14");
  assert.equal(sum.todayWatched, 1);
  assert.equal(sum.todayBlocked, 3);
  assert.equal(sum.days, 3);
  assert.equal(sum.avgWatched, (2 + 4 + 1) / 3);
  assert.equal(sum.avgBlocked, (1 + 2 + 3) / 3);
  assert.equal(KPixel.formatUsageNumber(sum.avgWatched), "2.3");
  assert.equal(KPixel.formatUsageNumber(sum.avgBlocked), "2");
});

test("addUsageIds keeps a rolling window of days", () => {
  const days = {};
  for (let i = 1; i <= 5; i++) {
    KPixel.addUsageIds(
      days,
      "2026-01-0" + i,
      "watched",
      ["v" + i],
      3
    );
  }
  assert.equal(Object.keys(days).length, 3);
  assert.equal(days["2026-01-01"], undefined);
  assert.ok(days["2026-01-05"]);
});
