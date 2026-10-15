import { randomUUID } from "node:crypto";
import {
  DemoError,
  uuid,
  partnerOrigin,
  sessionSecret,
  configuration,
  requiredScopes,
} from "./config.mjs";
import { createNaijaClient } from "./naija-client.mjs";
import {
  browserSession,
  csrfToken,
  assertCsrf,
  cookie,
  signCookie,
  bookings,
  rememberBooking,
  idempotencyKey,
} from "./session.mjs";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  Vary: "Cookie",
};
function json(data, requestId, status = 200, extra = {}) {
  return Response.json(
    { data, meta: { request_id: requestId } },
    { status, headers: { ...headers, "X-Request-ID": requestId, ...extra } },
  );
}
function object(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((x) => !allowed.includes(x))
  )
    throw new DemoError(400, "INVALID_REQUEST", "Send only the documented ticket selection.");
  return value;
}
export async function readJson(request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
  )
    throw new DemoError(415, "JSON_REQUIRED", "Send a JSON ticket selection.");
  const reader = request.body?.getReader();
  let length = 0;
  const parts = [];
  try {
    if (!reader) throw new Error("Empty");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader.cancel();
        throw new DemoError(413, "PAYLOAD_TOO_LARGE", "The ticket selection is too large.");
      }
      parts.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
  } catch (error) {
    if (error instanceof DemoError) throw error;
    throw new DemoError(400, "INVALID_REQUEST", "Send a valid ticket selection.");
  }
}
export function selection(body) {
  const row = object(body, ["event_id", "items", "promo_code", "intent_id"]);
  if (!Array.isArray(row.items) || !row.items.length || row.items.length > 20)
    throw new DemoError(400, "INVALID_REQUEST", "Choose at least one ticket type.");
  const items = row.items
    .map((raw) => {
      const item = object(raw, ["ticket_type_id", "quantity"]);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
        throw new DemoError(400, "INVALID_REQUEST", "Choose 1 to 20 packages of each ticket type.");
      return { ticket_type_id: uuid(item.ticket_type_id), quantity: item.quantity };
    })
    .sort((a, b) => a.ticket_type_id.localeCompare(b.ticket_type_id));
  if (new Set(items.map((x) => x.ticket_type_id)).size !== items.length)
    throw new DemoError(400, "INVALID_REQUEST", "Choose each ticket type once.");
  if (row.promo_code != null && typeof row.promo_code !== "string")
    throw new DemoError(400, "INVALID_REQUEST", "Invalid Promo Code");
  const promo = (row.promo_code || "").trim().toUpperCase();
  if (promo && !/^[A-Z0-9_-]{3,32}$/.test(promo))
    throw new DemoError(400, "INVALID_REQUEST", "Invalid Promo Code");
  return {
    event_id: uuid(row.event_id),
    intent_id: uuid(row.intent_id),
    items,
    ...(promo ? { promo_code: promo } : {}),
  };
}
function validateCart(cart, tickets) {
  let admissions = 0;
  for (const item of cart.items) {
    const ticket = tickets.find((x) => x.id === item.ticket_type_id);
    if (
      !ticket ||
      !["open", "allocation_limited"].includes(ticket.sale_status) ||
      item.quantity < Math.max(1, ticket.min_packages_per_order) ||
      item.quantity >
        Math.min(
          20,
          ticket.max_packages_per_order,
          ticket.remaining_packages,
          ticket.max_packages_at_current_price,
        )
    )
      throw new DemoError(
        409,
        "SELECTION_CHANGED",
        "This selection is no longer available at the displayed price. Refresh the event and choose again.",
      );
    admissions += item.quantity * ticket.admissions_per_ticket;
  }
  if (!Number.isSafeInteger(admissions) || admissions > 400)
    throw new DemoError(400, "INVALID_REQUEST", "Choose no more than 400 admissions per booking.");
  return admissions;
}
export function createApplication({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  log = () => {},
} = {}) {
  const client = createNaijaClient({ env, fetchImpl, now });
  const budgets = new Map();
  function limit(owner) {
    const current = now();
    for (const [key, value] of budgets) if (value.until <= current) budgets.delete(key);
    const old = budgets.get(owner) || { count: 0, until: current + 60000 };
    if (old.count >= 10 || (!budgets.has(owner) && budgets.size >= 2048))
      throw new DemoError(429, "RATE_LIMITED", "Wait a moment before starting another checkout.");
    old.count++;
    budgets.set(owner, old);
  }
  async function monitoring() {
    const checks = [
      {
        id: "authentication",
        label: "API authentication",
        state: "pending",
        detail: "Waiting for sandbox settings.",
      },
      {
        id: "events",
        label: "Sandbox events",
        state: "pending",
        detail: "No event request verified yet.",
      },
      { id: "checkout", label: "Hosted checkout", state: "pending", detail: "Not verified yet." },
      {
        id: "payments",
        label: "Payment verification",
        state: "manual",
        detail: "Requires a completed Paystack test payment.",
      },
      {
        id: "tickets",
        label: "Ticket issuance",
        state: "manual",
        detail: "Check a completed booking and its Naija Tickets account.",
      },
      {
        id: "webhooks",
        label: "Partner webhooks",
        state: "unavailable",
        detail: "Not implemented by the current Naija Tickets API.",
      },
    ];
    try {
      configuration(env);
      const identity = await client.identity();
      checks[0] = {
        ...checks[0],
        state: "ready",
        detail: "Test integration identity verified server-side.",
      };
      try {
        const list = await client.events();
        checks[1] = {
          ...checks[1],
          state: "ready",
          detail: list.events.length
            ? "Assigned sandbox events retrieved successfully."
            : "Connection verified. No assigned published sandbox events yet.",
        };
      } catch (cause) {
        checks[1] = {
          ...checks[1],
          state: "blocked",
          detail: cause instanceof DemoError ? cause.message : "Sandbox events are unavailable.",
        };
      }
      let signingReady = false;
      try {
        sessionSecret(env);
        partnerOrigin(env);
        signingReady = true;
      } catch {
        /* Keep public diagnostics secret-free. */
      }
      const missing = requiredScopes.filter((scope) => !identity.scopes.includes(scope));
      checks[2] = {
        ...checks[2],
        state:
          signingReady &&
          identity.capabilities.hosted_checkout &&
          identity.capabilities.sandbox_purchases &&
          !missing.length
            ? "ready"
            : "blocked",
        detail: !signingReady
          ? "Configure secure partner sessions and this website origin."
          : missing.length
            ? "The Test key needs all six demo permissions."
            : identity.capabilities.hosted_checkout && identity.capabilities.sandbox_purchases
              ? "Sandbox reports checkout available. A payment has not been tested by this check."
              : "Enable hosted checkout on the isolated sandbox server.",
      };
      return {
        connection: checks[1].state === "ready" ? "connected" : "blocked",
        checked_at: new Date(now()).toISOString(),
        environment: "test",
        checks,
      };
    } catch (cause) {
      checks[0] = {
        ...checks[0],
        state: "blocked",
        detail:
          cause instanceof DemoError
            ? cause.message
            : "The sandbox connection could not be verified.",
      };
      return {
        connection: "not_connected",
        checked_at: new Date(now()).toISOString(),
        environment: "test",
        checks,
      };
    }
  }
  return async function handle(request) {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url);
      // Explicit route parameter used by Vercel rewrites; never a URL to proxy.
      const routed =
        ["/api", "/api/index", "/api/index.mjs"].includes(url.pathname) &&
        url.searchParams.has("route")
          ? "/api/" + url.searchParams.get("route")
          : url.pathname;
      if (routed === "/api/webhooks/naija-tickets") {
        if (request.method !== "POST") return json(null, requestId, 405, { Allow: "POST" });
        throw new DemoError(
          501,
          "WEBHOOKS_NOT_SUPPORTED",
          "Naija Tickets does not send partner webhooks yet. No delivery was accepted.",
        );
      }
      const post = routed === "/api/checkout";
      if (request.method !== (post ? "POST" : "GET"))
        return json(null, requestId, 405, { Allow: post ? "POST" : "GET" });
      if (routed === "/api/bootstrap") {
        let browser;
        try {
          browser = browserSession(request, env, now(), true);
          partnerOrigin(env);
        } catch {
          return json({ csrf_token: null, checkout_ready: false }, requestId);
        }
        return json({ csrf_token: csrfToken(browser, env), checkout_ready: true }, requestId, 200, {
          "Set-Cookie": cookie("demo_browser", signCookie(browser, "browser", env), env),
        });
      }
      if (routed === "/api/status") return json(await monitoring(), requestId);
      if (routed === "/api/events")
        return json(await client.events(url.searchParams.get("cursor")), requestId);
      if (routed === "/api/event") {
        const id = uuid(url.searchParams.get("id"));
        const [event, tickets] = await Promise.all([client.event(id), client.tickets(id)]);
        return json({ event, tickets }, requestId);
      }
      if (routed === "/api/checkout") {
        const browser = browserSession(request, env, now());
        const origin = partnerOrigin(env);
        assertCsrf(request, browser, env, origin);
        limit(browser.id);
        const cart = selection(await readJson(request));
        await client.event(cart.event_id); // Recheck assigned, published event on the server.
        const ticketTypes = await client.tickets(cart.event_id);
        const admissions = validateCart(cart, ticketTypes);
        const { intent_id, ...intent } = cart;
        const booking = await client.checkout(
          { ...intent, return_url: origin + "/confirmation", cancel_url: origin + "/confirmation" },
          idempotencyKey(browser, intent_id, env),
        );
        if (booking.admissions !== admissions)
          throw new DemoError(
            502,
            "INVALID_API_RESPONSE",
            "The reserved admission count did not match the selection.",
          );
        return json(
          { checkout_url: booking.checkout_url, session_id: booking.id },
          requestId,
          200,
          { "Set-Cookie": rememberBooking(request, browser, booking, env, now()) },
        );
      }
      if (routed === "/api/confirmation") {
        const browser = browserSession(request, env, now());
        const id = uuid(url.searchParams.get("session"));
        const own = bookings(request, browser, env, now()).find((x) => x.id === id);
        if (!own)
          throw new DemoError(
            404,
            "BOOKING_NOT_FOUND",
            "Open this booking in the browser used to start checkout.",
          );
        const booking = await client.status(id);
        if (booking.id !== id || booking.event_id !== own.event_id)
          throw new DemoError(
            502,
            "INVALID_API_RESPONSE",
            "The booking result could not be verified.",
          );
        return json({ booking, account_url: configuration(env).apiOrigin + "/account" }, requestId);
      }
      throw new DemoError(404, "NOT_FOUND", "This page or endpoint does not exist.");
    } catch (cause) {
      const failure =
        cause instanceof DemoError
          ? cause
          : new DemoError(
              500,
              "DEMO_UNAVAILABLE",
              "This request could not be completed. Please try again.",
            );
      log({ request_id: requestId, status: failure.status, code: failure.code });
      return Response.json(
        { error: { code: failure.code, message: failure.message, request_id: requestId } },
        {
          status: failure.status,
          headers: {
            ...headers,
            "X-Request-ID": requestId,
            ...(failure.status === 429 ? { "Retry-After": "60" } : {}),
          },
        },
      );
    }
  };
}
