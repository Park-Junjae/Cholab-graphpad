const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");

test("deployment loader cache-busts payload chunks", () => {
  const loader = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...loader.matchAll(/payload\/chunk-(\d{3})\.js\?v=([a-f0-9]{12})/g)];
  assert.ok(scripts.length > 0);
  assert.equal(new Set(scripts.map((match) => match[2])).size, 1);
});

test("built app cache-busts qPCR core and contains no placeholder", () => {
  const loader = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const chunkNames = [...loader.matchAll(/payload\/(chunk-\d{3}\.js)\?v=[a-f0-9]{12}/g)]
    .map((match) => match[1]);
  const encoded = chunkNames.map((name) => {
    const content = fs.readFileSync(path.join(root, "payload", name), "utf8");
    const match = content.match(/=\s*'([^']+)'/);
    assert.ok(match, `${name} payload is readable`);
    return match[1];
  }).join("");
  const html = zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
  assert.match(html, /qpcr-core\.js\?v=[a-f0-9]{12}/);
  assert.doesNotMatch(html, /__QPCR_CORE_VERSION__/);
});
