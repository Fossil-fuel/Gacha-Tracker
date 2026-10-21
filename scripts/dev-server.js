#!/usr/bin/env node
"use strict";

/**
 * Local tracker server: static site + Game8 extracurricular scan.
 * Browser pages cannot read Game8 directly (CORS), so the scan runs here.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { mergeGame8Pages, discoverFollowUps, discoverEventPages } = require("./extra-scan-parse");

const PORT = Number(process.env.PORT) || 4000;
const ROOT = path.join(__dirname, "..");
const MAX_URLS = 6;
const MAX_EVENT_PAGES = 24;
const MAX_BYTES = 2 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");
}

function isAllowedScanUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!/(^|\.)game8\.co$/i.test(url.hostname)) return null;
  return url.href;
}

function fetchText(url, redirectsLeft) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "GachaTracker extra-scan", Accept: "text/html" } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          fetchText(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("HTTP " + res.statusCode + " for " + url));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new Error("Page too large: " + url));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );
    req.setTimeout(20000, () => {
      req.destroy(new Error("Timed out: " + url));
    });
    req.on("error", reject);
  });
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = [];
  const count = Math.min(limit, items.length);
  for (let w = 0; w < count; w++) {
    workers.push((async () => {
      while (cursor < items.length) {
        const index = cursor++;
        out[index] = await fn(items[index], index);
      }
    })());
  }
  await Promise.all(workers);
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (_) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handleScan(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message || "Bad request" });
    return;
  }
  const requested = Array.isArray(body.urls) ? body.urls : [];
  const urls = [];
  requested.forEach((raw) => {
    const href = isAllowedScanUrl(String(raw || "").trim());
    if (href && urls.indexOf(href) < 0) urls.push(href);
  });
  if (!urls.length) {
    sendJson(res, 400, { ok: false, error: "Add at least one https://game8.co page." });
    return;
  }
  const pages = [];
  const warnings = [];
  for (let i = 0; i < urls.length && pages.length < MAX_URLS; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url, 4);
      pages.push({ url, html });
      discoverFollowUps(html, url).forEach((next) => {
        if (urls.length >= MAX_URLS) return;
        if (!urls.includes(next)) urls.push(next);
      });
    } catch (err) {
      warnings.push((err && err.message) || String(err));
    }
  }
  if (!pages.length) {
    sendJson(res, 502, { ok: false, error: warnings[0] || "Could not read those pages.", warnings });
    return;
  }
  const eventLinks = [];
  pages.forEach((page) => {
    discoverEventPages(page.html, page.url).forEach((link) => {
      if (eventLinks.length >= MAX_EVENT_PAGES) return;
      if (!eventLinks.some((have) => have.href === link.href)) eventLinks.push(link);
    });
  });
  const eventPages = (await mapPool(eventLinks, 4, async (link) => {
    try {
      const html = await fetchText(link.href, 4);
      return { title: link.title, html, url: link.href };
    } catch (err) {
      warnings.push((err && err.message) || String(err));
      return null;
    }
  })).filter(Boolean);
  const merged = mergeGame8Pages(pages.map((p) => p.html), eventPages);
  sendJson(res, 200, {
    ok: true,
    version: merged.version || "",
    releasedOn: merged.releasedOn || null,
    updateEndDate: merged.updateEndDate || null,
    tasks: merged.tasks || [],
    sources: pages.map((p) => p.url).concat(eventPages.map((p) => p.url)),
    eventPages: eventPages.length,
    warnings,
  });
}

function serveStatic(req, res) {
  const hostUrl = new URL(req.url || "/", "http://127.0.0.1");
  let rel = decodeURIComponent(hostUrl.pathname);
  if (rel === "/") rel = "/index.html";
  if (rel.includes("\0")) {
    send(res, 400, "Bad path");
    return;
  }
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, "Not found");
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && (req.url || "").split("?")[0] === "/api/extra-scan") {
    handleScan(req, res).catch((err) => {
      sendJson(res, 500, { ok: false, error: err.message || "Scan failed" });
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Gacha Tracker http://127.0.0.1:" + PORT);
});
