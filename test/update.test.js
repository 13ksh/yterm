const test = require("node:test");
const assert = require("node:assert/strict");
const KPixel = require("../shared.js");

test("compareVersions orders dotted versions", () => {
  assert.equal(KPixel.compareVersions("1.6.0", "1.5.2"), 1);
  assert.equal(KPixel.compareVersions("1.5.2", "1.6.0"), -1);
  assert.equal(KPixel.compareVersions("1.6.0", "v1.6.0"), 0);
  assert.equal(KPixel.compareVersions("1.6.0", "1.6"), 0);
});

test("parseGithubRepo reads urls and owner/name", () => {
  assert.deepEqual(KPixel.parseGithubRepo("https://github.com/acme/kpixel-filter"), {
    owner: "acme",
    repo: "kpixel-filter",
  });
  assert.deepEqual(KPixel.parseGithubRepo("https://github.com/acme/kpixel-filter.git"), {
    owner: "acme",
    repo: "kpixel-filter",
  });
  assert.deepEqual(KPixel.parseGithubRepo("acme/kpixel-filter"), {
    owner: "acme",
    repo: "kpixel-filter",
  });
  assert.equal(KPixel.parseGithubRepo(""), null);
  assert.equal(KPixel.parseGithubRepo("not a repo"), null);
});

test("parseUpdateManifest prefers a zip asset on GitHub releases", () => {
  const feeds = KPixel.updateFeedUrls({ owner: "acme", repo: "kpixel-filter" });
  const parsed = KPixel.parseUpdateManifest(
    {
      tag_name: "v1.6.0",
      html_url: "https://github.com/acme/kpixel-filter/releases/tag/v1.6.0",
      body: "notes",
      assets: [
        {
          name: "kpixel-channel-filter.zip",
          browser_download_url:
            "https://github.com/acme/kpixel-filter/releases/download/v1.6.0/kpixel-channel-filter.zip",
        },
      ],
    },
    feeds
  );
  assert.equal(parsed.version, "1.6.0");
  assert.equal(
    parsed.zip,
    "https://github.com/acme/kpixel-filter/releases/download/v1.6.0/kpixel-channel-filter.zip"
  );
});

test("parseUpdateManifest resolves a repo-relative zip", () => {
  const feeds = KPixel.updateFeedUrls({ owner: "acme", repo: "kpixel-filter" });
  const parsed = KPixel.parseUpdateManifest(
    { version: "1.6.0", notes: "hi", zip: "kpixel-channel-filter.zip" },
    feeds
  );
  assert.equal(parsed.version, "1.6.0");
  assert.equal(
    parsed.zip,
    "https://raw.githubusercontent.com/acme/kpixel-filter/main/kpixel-channel-filter.zip"
  );
  assert.equal(KPixel.compareVersions(parsed.version, "1.5.2") > 0, true);
});
