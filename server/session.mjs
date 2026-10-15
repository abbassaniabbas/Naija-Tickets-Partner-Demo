import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { DemoError, sessionSecret, uuidPattern } from "./config.mjs";
const lifetime = 7 * 24 * 60 * 60;
function signature(value, purpose, env) {
  return createHmac("sha256", sessionSecret(env))
    .update(`lagos-demo.v1.${purpose}.${value}`)
    .digest("base64url");
}
export function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length > 256 || b.length > 256)
    return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function signCookie(payload, purpose, env) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${signature(data, purpose, env)}`;
}
export function readCookie(request, name, purpose, env, now = Date.now()) {
  const raw = request.headers.get("cookie") || "";
  if (raw.length > 16384) return null;
  const part = raw
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
  if (!part || part.length > 3500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(part)) return null;
  const [data, tag] = part.split(".");
  if (!sameSecret(tag, signature(data, purpose, env))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    const current = Math.floor(now / 1000);
    if (
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= current ||
      payload.exp > current + lifetime + 5
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}
export function browserSession(request, env, now, create = false) {
  sessionSecret(env);
  const old = readCookie(request, "demo_browser", "browser", env, now);
  if (old && typeof old.id === "string" && uuidPattern.test(old.id)) return old;
  if (!create)
    throw new DemoError(
      401,
      "BOOKING_BROWSER_REQUIRED",
      "Open this booking in the browser used to start checkout.",
    );
  return { id: randomUUID(), exp: Math.floor(now / 1000) + lifetime };
}
export function cookie(name, value, env) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetime}${env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function csrfToken(browser, env) {
  return signature(browser.id, "csrf", env);
}
export function assertCsrf(request, browser, env, origin) {
  if (
    request.headers.get("origin") !== origin ||
    !sameSecret(request.headers.get("x-demo-csrf"), csrfToken(browser, env))
  )
    throw new DemoError(403, "INVALID_ORIGIN", "Refresh this website before starting checkout.");
}
export function idempotencyKey(browser, intent, env) {
  return `partner-${signature(`${browser.id}.${intent}`, "purchase", env)}`;
}
export function bookings(request, browser, env, now) {
  const saved = readCookie(request, "demo_bookings", "bookings", env, now);
  return saved?.owner === browser.id &&
    Array.isArray(saved.items) &&
    saved.items.length <= 8 &&
    saved.items.every((x) => x && uuidPattern.test(x.id) && uuidPattern.test(x.event_id))
    ? saved.items
    : [];
}
export function rememberBooking(request, browser, booking, env, now) {
  const items = bookings(request, browser, env, now).filter((x) => x.id !== booking.id);
  items.push({ id: booking.id, event_id: booking.event_id });
  return cookie(
    "demo_bookings",
    signCookie(
      { owner: browser.id, items: items.slice(-8), exp: Math.floor(now / 1000) + lifetime },
      "bookings",
      env,
    ),
    env,
  );
}
