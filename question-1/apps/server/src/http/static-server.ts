import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function contentType(filePath: string): string {
  return CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
}

function resolvePublicFile(publicDir: string, requestPath: string): string {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const normalizedRoot = normalize(publicDir);
  const candidate = normalize(join(normalizedRoot, relativePath));
  const rootPrefix = `${normalizedRoot}${process.platform === "win32" ? "\\" : "/"}`;
  const isSafe = candidate === normalizedRoot || candidate.startsWith(rootPrefix);
  if (!isSafe) return join(normalizedRoot, "index.html");
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(normalizedRoot, "index.html");
}

export function createStaticHandler(publicDir: string) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "draw-guess-server" }));
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end();
      return;
    }
    if (!existsSync(publicDir)) {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("Web client is not built. Run npm run build or npm run dev.");
      return;
    }

    const requestedPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
    const filePath = resolvePublicFile(publicDir, requestedPath);
    response.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-cache" });
    createReadStream(filePath).pipe(response);
  };
}
