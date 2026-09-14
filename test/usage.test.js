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

test("summarizeUsage reports today and lifetime totals", () => {
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
  assert.equal(sum.totalWatched, 7);
  assert.equal(sum.totalBlocked, 6);
  assert.equal(KPixel.formatUsageNumber(sum.totalWatched), "7");
});

test("mergeUsageSafe never lowers stored totals", () => {
  const summary = {
    todayKey: "2026-09-14",
    todayWatched: 1,
    todayBlocked: 2,
    totalWatched: 4,
    totalBlocked: 5,
    days: 2,
  };
  const merged = KPixel.mergeUsageSafe(summary, {
    totalWatched: 20,
    totalBlocked: 9,
    todayKey: "2026-09-14",
    todayWatched: 3,
    todayBlocked: 1,
  });
  assert.equal(merged.totalWatched, 20);
  assert.equal(merged.totalBlocked, 9);
  assert.equal(merged.todayWatched, 3);
  assert.equal(merged.todayBlocked, 2);
});

test("addUsageIds keeps a rolling window of days when asked", () => {
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

test("addUsageIds does not drop history by default", () => {
  const days = {};
  for (let i = 1; i <= 5; i++) {
    KPixel.addUsageIds(days, "2026-01-0" + i, "watched", ["v" + i]);
  }
  assert.equal(Object.keys(days).length, 5);
});
