import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 43187);
const API = "https://del.kpixel.net/";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

async function proxyFlag(channelId, res) {
  const target = API + encodeURIComponent(channelId);
  try {
    const upstream = await fetch(target, { cache: "no-store" });
    const text = await upstream.text();
    send(res, upstream.status, text, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  } catch (err) {
    send(res, 502, String(err && err.message), {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }
}

async function staticFile(urlPath, res) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/") rel = "/demo/index.html";
  if (rel === "/demo" || rel === "/demo/") rel = "/demo/index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    send(res, 403, "forbidden");
    return;
  }
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file);
    send(res, 200, data, { "Content-Type": TYPES[ext] || "application/octet-stream" });
  } catch {
    send(res, 404, "not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    const id = url.pathname.slice(5);
    await proxyFlag(id, res);
    return;
  }
  await staticFile(url.pathname, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`KPixel preview http://127.0.0.1:${PORT}`);
});
