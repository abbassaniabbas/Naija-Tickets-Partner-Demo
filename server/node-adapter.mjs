import { Readable } from "node:stream";
export async function nodeResponse(req, res, handle) {
  const host = "http://partner.internal";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (value != null) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  const method = req.method || "GET";
  let body;
  if (!["GET", "HEAD"].includes(method)) {
    body =
      req.body !== undefined
        ? typeof req.body === "string" || Buffer.isBuffer(req.body)
          ? req.body
          : JSON.stringify(req.body)
        : Readable.toWeb(req);
  }
  const response = await handle(
    new Request(new URL(req.url || "/", host), {
      method,
      headers,
      ...(body !== undefined ? { body, duplex: "half" } : {}),
    }),
  );
  res.statusCode = response.status;
  for (const [key, value] of response.headers) if (key !== "set-cookie") res.setHeader(key, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}
