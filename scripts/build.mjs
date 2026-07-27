import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptDir);
const sourceHtmlPath = join(rootDir, "src", "index.html");
const sourceCorePath = join(rootDir, "src", "qpcr-core.js");
const payloadDir = join(rootDir, "payload");
const outputCorePath = join(rootDir, "qpcr-core.js");
const outputIndexPath = join(rootDir, "index.html");
const chunkSize = 4000;

await mkdir(payloadDir, { recursive: true });

const sourceHtmlTemplate = await readFile(sourceHtmlPath, "utf8");
const sourceCore = await readFile(sourceCorePath);
const coreDigest = createHash("sha256").update(sourceCore).digest("hex").slice(0, 12);
const sourceHtmlText = sourceHtmlTemplate.replaceAll("__QPCR_CORE_VERSION__", coreDigest);
if (sourceHtmlText === sourceHtmlTemplate) {
  throw new Error("src/index.html에 __QPCR_CORE_VERSION__ placeholder가 없습니다.");
}
const sourceHtml = Buffer.from(sourceHtmlText, "utf8");
const compressed = gzipSync(sourceHtml, { level: 9, mtime: 0 });
const encoded = compressed.toString("base64");
const chunks = [];
for (let offset = 0; offset < encoded.length; offset += chunkSize) {
  chunks.push(encoded.slice(offset, offset + chunkSize));
}

const existing = await readdir(payloadDir);
for (const name of existing) {
  if (/^chunk-\d{3}\.js$/.test(name)) await rm(join(payloadDir, name));
}

await Promise.all(chunks.map((chunk, index) => {
  const name = `chunk-${String(index).padStart(3, "0")}.js`;
  return writeFile(
    join(payloadDir, name),
    `window.__CHOLAB_PAYLOAD[${index}] = '${chunk}';\n`,
    "utf8"
  );
}));
await cp(sourceCorePath, outputCorePath);

const digest = createHash("sha256").update(sourceHtml).digest("hex").slice(0, 12);
const scriptTags = chunks
  .map((_, index) => `  <script src="payload/chunk-${String(index).padStart(3, "0")}.js?v=${digest}"></script>`)
  .join("\n");
const loader = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cholab GraphPad</title>
  <style>
    html, body { margin: 0; }
    #cholab-loader {
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
      background: #f8fafc;
    }
    #cholab-loader .status { text-align: center; max-width: 520px; padding: 28px; }
    #cholab-loader .brand { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    #cholab-loader .note { color: #64748b; line-height: 1.6; }
  </style>
</head>
<body>
  <div id="cholab-loader">
    <div class="status">
      <div class="brand">Cholab GraphPad</div>
      <div class="note">앱을 불러오는 중입니다. 잠시만 기다려 주세요.</div>
    </div>
  </div>
  <script>window.__CHOLAB_PAYLOAD = [];</script>
${scriptTags}
  <script>
  (async function() {
    function renderError(error) {
      document.body.innerHTML = \`<div id="cholab-loader"><div class="status"><div class="brand">Cholab GraphPad</div><div class="note">앱을 여는 중 문제가 생겼습니다.<br>\${String(error && error.message ? error.message : error)}</div></div></div>\`;
    }
    function bytesFromBase64(value) {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    async function inflateGzip(bytes) {
      if (!("DecompressionStream" in window)) {
        throw new Error("이 브라우저는 앱 압축 해제를 지원하지 않습니다. 최신 Chrome, Edge 또는 Safari에서 열어 주세요.");
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).text();
    }
    try {
      const chunks = window.__CHOLAB_PAYLOAD || [];
      if (chunks.length !== ${chunks.length} || chunks.some(function(chunk) { return !chunk; })) {
        throw new Error("앱 파일 일부를 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
      }
      const html = await inflateGzip(bytesFromBase64(chunks.join("")));
      const loader = document.getElementById("cholab-loader");
      if (loader) loader.remove();
      document.open("text/html", "replace");
      document.write(html);
      document.close();
    } catch (error) {
      renderError(error);
    }
  })();
  </script>
</body>
</html>
`;
await writeFile(outputIndexPath, loader, "utf8");

console.log(`Built ${chunks.length} payload chunks from ${sourceHtml.length} source bytes (${digest}).`);
