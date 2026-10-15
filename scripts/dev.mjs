import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
import { createApplication } from "../server/app.mjs";
import { nodeResponse } from "../server/node-adapter.mjs";
const root = fileURLToPath(new URL("../public/", import.meta.url));
const handle = createApplication({
  log: (item) => console.info("partner_demo", JSON.stringify(item)),
});
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
export const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api" || url.pathname.startsWith("/api/"))
      return await nodeResponse(req, res, handle);
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }
    const route =
      url.pathname === "/" ||
      ["/integration", "/confirmation"].includes(url.pathname) ||
      /^\/events\/[a-f0-9-]{36}$/i.test(url.pathname);
    const path = route
      ? resolve(root, "index.html")
      : resolve(root, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(root)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const data = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Security-Policy": contentSecurityPolicy,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const port = Number(process.env.PORT || 3001);
server.listen(port, "127.0.0.1", () => console.log(`Lagos Events Demo: http://localhost:${port}`));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
