const test = require("node:test");
const assert = require("node:assert/strict");
const KPixel = require("../shared.js");

test("del.kpixel.net returns f for a known public channel", async () => {
  const res = await fetch("https://del.kpixel.net/UCXuqSBlHAE6Xw-yeJA0Tunw");
  assert.equal(res.ok, true);
  const text = await res.text();
  assert.equal(KPixel.parseFlagResponse(text), "f");
});

test("del.kpixel.net rejects a non-channel id", async () => {
  const res = await fetch("https://del.kpixel.net/UCdummytest1234567890abcd");
  const text = await res.text();
  assert.equal(KPixel.parseFlagResponse(text), "unknown");
});
