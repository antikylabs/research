import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { outputDirectory } from "./paths.mjs";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function resolveReportTarget(root, requestUrl) {
  const rawPath = requestUrl.split("?", 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.split("/").includes("..")) return null;
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const relative = pathname.replace(/^\/+/, "");
  const file = pathname.endsWith("/") || path.extname(pathname) === ""
    ? path.join(relative, "index.html")
    : relative;
  const target = path.resolve(root, file);
  const resolvedRoot = path.resolve(root);
  return target === resolvedRoot || target.startsWith(`${resolvedRoot}${path.sep}`)
    ? target
    : null;
}

export async function serveReport({ port = 4173, root = outputDirectory } = {}) {
  try {
    await access(path.join(root, "index.html"));
  } catch {
    throw new Error("No assembled benchmark site found. Run npm run benchmark:all first.");
  }
  const server = createServer(async (request, response) => {
    const target = resolveReportTarget(root, request.url ?? "/");
    if (target === null) {
      response.writeHead(400).end("Invalid path");
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": CONTENT_TYPES[path.extname(target)] ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(`\nBenchmark evidence suite: http://127.0.0.1:${port}/`);
  console.log("Press Ctrl+C to stop the report server.");
  return server;
}
