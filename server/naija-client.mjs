import { configuration, DemoError, uuid, requiredScopes } from "./config.mjs";
const states = [
  "open",
  "reserved",
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "refunded",
  "partially_refunded",
];
const text = (v, max = 16000) => (typeof v === "string" ? v.slice(0, max) : "");
function number(v, nullable = false) {
  if (nullable && v === null) return null;
  if (!Number.isSafeInteger(v) || v < 0)
    throw new DemoError(
      502,
      "INVALID_API_RESPONSE",
      "The sandbox returned information we could not safely display.",
    );
  return v;
}
export function imageUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}
export function eventView(e) {
  if (!e || !Number.isFinite(Date.parse(e.starts_at)) || !Number.isFinite(Date.parse(e.ends_at)))
    throw new DemoError(502, "INVALID_API_RESPONSE", "The sandbox event is unavailable.");
  return {
    id: uuid(e.id),
    title: text(e.title, 240),
    slug: text(e.slug, 240),
    description: text(e.description),
    image_url: imageUrl(e.image_url),
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    timezone: text(e.timezone, 80),
    venue: {
      name: text(e.venue?.name, 240),
      address: text(e.venue?.address, 500),
      city: text(e.venue?.city, 80),
      state: text(e.venue?.state, 80),
    },
    organiser: { name: text(e.organiser?.name, 160), verified: e.organiser?.verified === true },
    category: { name: text(e.category?.name, 100), slug: text(e.category?.slug, 64) },
  };
}
function ticketView(t) {
  if (
    !t ||
    t.currency !== "NGN" ||
    !["open", "upcoming", "closed", "sold_out", "allocation_limited"].includes(t.sale_status)
  )
    throw new DemoError(502, "INVALID_API_RESPONSE", "Sandbox ticket information is unavailable.");
  return {
    id: uuid(t.id),
    event_id: uuid(t.event_id),
    name: text(t.name, 160),
    description: text(t.description, 800),
    currency: "NGN",
    price_kobo: number(t.price_kobo),
    price_kind: text(t.price_kind, 30),
    admissions_per_ticket: number(t.admissions_per_ticket),
    min_packages_per_order: number(t.min_packages_per_order),
    max_packages_per_order: number(t.max_packages_per_order),
    sale_status: t.sale_status,
  };
}
export function sessionView(s) {
  if (
    !s ||
    s.environment !== "test" ||
    s.currency !== "NGN" ||
    !states.includes(s.status) ||
    !Number.isFinite(Date.parse(s.expires_at))
  )
    throw new DemoError(502, "INVALID_API_RESPONSE", "We could not verify this sandbox booking.");
  if (
    ["paid", "refunded", "partially_refunded"].includes(s.status) &&
    [s.subtotal_kobo, s.discount_kobo, s.fee_kobo, s.total_kobo].some((value) => value === null)
  )
    throw new DemoError(502, "INVALID_API_RESPONSE", "The verified booking amount is unavailable.");
  return {
    id: uuid(s.id),
    event_id: uuid(s.event_id),
    environment: "test",
    status: s.status,
    expires_at: s.expires_at,
    reservation_expires_at: s.reservation_expires_at || null,
    currency: "NGN",
    admissions: number(s.admissions),
    subtotal_kobo: number(s.subtotal_kobo, true),
    discount_kobo: number(s.discount_kobo, true),
    fee_kobo: number(s.fee_kobo, true),
    total_kobo: number(s.total_kobo, true),
    tickets_issued: number(s.tickets_issued),
    members_registered: number(s.members_registered),
  };
}
async function boundedJson(response) {
  if (Number(response.headers.get("content-length")) > 1024 * 1024)
    throw new DemoError(502, "INVALID_API_RESPONSE", "The sandbox response was too large.");
  const reader = response.body?.getReader();
  let bytes = 0,
    chunks = [];
  if (!reader)
    throw new DemoError(502, "INVALID_API_RESPONSE", "The sandbox returned an empty response.");
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        throw new Error("Limit");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DemoError(
      502,
      "INVALID_API_RESPONSE",
      "The sandbox returned an unreadable response.",
    );
  }
}
export function createNaijaClient({ env, fetchImpl = fetch, now = Date.now }) {
  let identityCache;
  async function call(path, { method = "GET", body, idempotency } = {}) {
    const config = configuration(env);
    let response;
    try {
      response = await fetchImpl(config.apiOrigin + path, {
        method,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new DemoError(
        503,
        "SANDBOX_UNREACHABLE",
        "The ticketing sandbox is taking a break. Please try again shortly.",
      );
    }
    const payload = await boundedJson(response);
    if (!response.ok) {
      const code = payload?.error?.code;
      const known = {
        SANDBOX_NOT_CONFIGURED: "The separate Naija Tickets sandbox has not been configured yet.",
        CHECKOUT_NOT_CONFIGURED: "Hosted checkout has not been enabled on the sandbox.",
        INVALID_API_KEY: "The sandbox API key could not be verified.",
        INSUFFICIENT_SCOPE: "The sandbox API key needs additional permissions.",
        IDEMPOTENCY_CONFLICT:
          "This checkout attempt already has a different selection. Start a new attempt.",
        CHECKOUT_CONFLICT:
          "The ticket selection has changed or is no longer available. Refresh and select again.",
        NOT_FOUND: "This event or booking is no longer available.",
        RATE_LIMITED: "The sandbox is busy. Wait a moment and try again.",
      };
      const safeCode = Object.hasOwn(known, code) ? code : "SANDBOX_REQUEST_FAILED";
      throw new DemoError(
        response.status === 404
          ? 404
          : response.status === 409
            ? 409
            : response.status === 429
              ? 429
              : 503,
        safeCode,
        known[safeCode] || "The sandbox could not complete this request. Please try again later.",
      );
    }
    if (!payload || !Object.hasOwn(payload, "data"))
      throw new DemoError(
        502,
        "INVALID_API_RESPONSE",
        "The sandbox response does not match the integration contract.",
      );
    return payload;
  }
  async function identity() {
    configuration(env);
    if (identityCache && identityCache.until > now()) return identityCache.value;
    const { data } = await call("/api/v1/integration");
    if (
      data?.environment !== "test" ||
      !Array.isArray(data.scopes) ||
      !data.scopes.every((x) => typeof x === "string")
    )
      throw new DemoError(
        503,
        "LIVE_SOURCE_BLOCKED",
        "This website accepts an isolated Test integration only.",
      );
    const value = {
      environment: "test",
      scopes: data.scopes.filter((x) => requiredScopes.includes(x)),
      capabilities: {
        event_api: data.capabilities?.event_api === true,
        hosted_checkout: data.capabilities?.hosted_checkout === true,
        sandbox_purchases: data.capabilities?.sandbox_purchases === true,
      },
    };
    identityCache = { value, until: now() + 20000 };
    return value;
  }
  async function guard(scope, checkout = false) {
    const value = await identity();
    if (!value.scopes.includes(scope))
      throw new DemoError(
        503,
        "INSUFFICIENT_SCOPE",
        "The sandbox API key needs additional permissions.",
      );
    if (
      !value.capabilities.event_api ||
      (checkout && (!value.capabilities.hosted_checkout || !value.capabilities.sandbox_purchases))
    )
      throw new DemoError(
        503,
        checkout ? "CHECKOUT_NOT_CONFIGURED" : "SANDBOX_NOT_CONFIGURED",
        checkout
          ? "Hosted checkout has not been enabled on the sandbox."
          : "The isolated event sandbox is not ready yet.",
      );
  }
  async function events(cursor) {
    await guard("events:read");
    const query = new URLSearchParams({ limit: "12" });
    if (cursor) {
      if (typeof cursor !== "string" || cursor.length > 1024)
        throw new DemoError(400, "INVALID_REQUEST", "Refresh the event list.");
      query.set("cursor", cursor);
    }
    const { data, meta } = await call("/api/v1/events?" + query);
    if (
      !Array.isArray(data) ||
      data.length > 12 ||
      (meta?.next_cursor != null &&
        (typeof meta.next_cursor !== "string" || meta.next_cursor.length > 1024))
    )
      throw new DemoError(502, "INVALID_API_RESPONSE", "The sandbox event list is unavailable.");
    return { events: data.map(eventView), next_cursor: meta?.next_cursor || null };
  }
  async function event(id) {
    await guard("events:read");
    return eventView((await call("/api/v1/events/" + uuid(id))).data);
  }
  async function tickets(id) {
    await guard("tickets:read");
    await guard("availability:read");
    const rows = [];
    let cursor = null;
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const { data, meta } = await call(`/api/v1/events/${uuid(id)}/tickets?${query}`);
      if (!Array.isArray(data) || rows.length + data.length > 100)
        throw new DemoError(
          502,
          "CATALOGUE_LIMIT",
          "This demo supports up to 100 ticket types per event.",
        );
      rows.push(...data.map(ticketView));
      cursor = meta?.next_cursor || null;
      if (!cursor) break;
      if (typeof cursor !== "string" || cursor.length > 1024 || page === 4)
        throw new DemoError(502, "INVALID_API_RESPONSE", "The sandbox ticket list is unavailable.");
    }
    const { data: availability } = await call(`/api/v1/events/${uuid(id)}/availability`);
    if (
      availability?.event_id !== id ||
      !Array.isArray(availability.ticket_types) ||
      availability.ticket_types.length > 100 ||
      availability.advisory !== true
    )
      throw new DemoError(502, "INVALID_API_RESPONSE", "Sandbox availability is unavailable.");
    return rows.map((t) => {
      if (t.event_id !== id || t.admissions_per_ticket < 1)
        throw new DemoError(
          502,
          "INVALID_API_RESPONSE",
          "Sandbox ticket information is unavailable.",
        );
      const a = availability.ticket_types.find((x) => x.ticket_type_id === t.id);
      if (!a || a.admissions_per_ticket !== t.admissions_per_ticket)
        throw new DemoError(
          502,
          "INVALID_API_RESPONSE",
          "Ticket availability changed. Refresh this event.",
        );
      return {
        ...t,
        remaining_packages: number(a.remaining_packages),
        max_packages_at_current_price: number(a.max_packages_at_current_price),
        availability_as_of: text(availability.as_of, 60),
        advisory: true,
      };
    });
  }
  async function checkout(intent, idempotency) {
    await guard("checkout:write", true);
    const { data } = await call("/api/v1/checkout-sessions", {
      method: "POST",
      body: intent,
      idempotency,
    });
    const booking = sessionView(data),
      config = configuration(env);
    let url;
    try {
      url = new URL(data.checkout_url);
    } catch {
      throw new DemoError(
        502,
        "UNSAFE_CHECKOUT_URL",
        "The sandbox returned an invalid checkout link.",
      );
    }
    if (
      booking.event_id !== intent.event_id ||
      url.origin !== config.apiOrigin ||
      url.pathname !== `/integrations/checkout/${booking.id}` ||
      url.username ||
      url.password ||
      url.hash ||
      [...url.searchParams.keys()].length !== 1 ||
      !/^[a-f0-9]{64}$/.test(url.searchParams.get("access") || "")
    )
      throw new DemoError(
        502,
        "UNSAFE_CHECKOUT_URL",
        "The sandbox checkout link could not be safely verified.",
      );
    return { ...booking, checkout_url: url.toString() };
  }
  async function status(id) {
    await guard("orders:read");
    return sessionView((await call("/api/v1/checkout-sessions/" + uuid(id))).data);
  }
  return { identity, events, event, tickets, checkout, status };
}
