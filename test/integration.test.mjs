import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApplication } from "../server/app.mjs";
import { nodeResponse } from "../server/node-adapter.mjs";
import { configuration, partnerOrigin, sessionSecret } from "../server/config.mjs";
import { signCookie, sameSecret } from "../server/session.mjs";
import { createNaijaClient } from "../server/naija-client.mjs";
import { fixture, env, ids } from "./fixture.mjs";
function setup(changes = {}) {
  const f = fixture(),
    settings = { ...env, ...changes },
    logs = [];
  let clock = Date.now(),
    jar = "",
    csrf;
  const app = createApplication({
    env: settings,
    fetchImpl: f.fetchImpl,
    now: () => clock,
    log: (item) => logs.push(item),
  });
  async function request(path, { method = "GET", body, headers = {}, ownCookies = true } = {}) {
    const response = await app(
      new Request(env.PARTNER_ORIGIN + path, {
        method,
        headers: {
          ...(ownCookies && jar ? { Cookie: jar } : {}),
          ...(method === "POST"
            ? {
                Origin: env.PARTNER_ORIGIN,
                "Content-Type": "application/json",
                "X-Demo-CSRF": csrf || "",
              }
            : {}),
          ...headers,
        },
        ...(body !== undefined
          ? { body: typeof body === "string" ? body : JSON.stringify(body) }
          : {}),
      }),
    );
    const data = await response.json();
    if (response.headers.getSetCookie().length) {
      const parsed = new Map(
        jar
          .split("; ")
          .filter(Boolean)
          .map((x) => [x.split("=")[0], x]),
      );
      for (const line of response.headers.getSetCookie()) {
        const pair = line.split(";")[0];
        parsed.set(pair.split("=")[0], pair);
      }
      jar = [...parsed.values()].join("; ");
    }
    if (path === "/api/bootstrap") csrf = data.data?.csrf_token;
    return { response, payload: data, status: response.status };
  }
  const cart = (quantity = 1, ticket = ids.single, intent = ids.intent) => ({
    event_id: ids.event,
    items: [{ ticket_type_id: ticket, quantity }],
    intent_id: intent,
  });
  return {
    ...f,
    app,
    request,
    logs,
    settings,
    cart,
    jar: () => jar,
    tick: (ms) => {
      clock += ms;
    },
  };
}
test("unconfigured runtime shows a truthful monitor and never creates demo events or contacts production", async () => {
  const s = setup({ NAIJA_API_ORIGIN: "", NAIJA_TEST_API_KEY: "", DEMO_SESSION_SECRET: "" });
  const status = await s.request("/api/status");
  assert.equal(status.status, 200);
  assert.equal(status.payload.data.connection, "not_connected");
  assert.equal(status.payload.data.checks.find((x) => x.id === "webhooks").state, "unavailable");
  assert.equal((await s.request("/api/events")).status, 503);
  assert.equal((await s.request("/api/bootstrap")).payload.data.checkout_ready, false);
  assert.equal(s.calls.length, 0);
});
test("configuration blocks Live keys, the production source, unsafe origins, missing secrets and secret reuse", () => {
  for (const changes of [
    { NAIJA_TEST_API_KEY: env.NAIJA_TEST_API_KEY.replace("nt_test_", "nt_live_") },
    { NAIJA_API_ORIGIN: "https://naija-tickets.vercel.app" },
    { NAIJA_API_ORIGIN: "https://user:secret@sandbox.example.test" },
    { NAIJA_API_ORIGIN: "https://sandbox.example.test/api" },
    { NAIJA_API_ORIGIN: "https://sandbox.example.test?key=x" },
    { NAIJA_API_ORIGIN: "http://remote.example.test" },
  ])
    assert.throws(() => configuration({ ...env, ...changes }));
  assert.equal(
    configuration({ ...env, NAIJA_API_ORIGIN: "http://localhost:3000" }).apiOrigin,
    "http://localhost:3000",
  );
  assert.throws(() =>
    configuration({ ...env, NAIJA_API_ORIGIN: "http://localhost:3000", NODE_ENV: "production" }),
  );
  assert.throws(() => partnerOrigin({ NODE_ENV: "production" }));
  assert.throws(() => sessionSecret({ DEMO_SESSION_SECRET: "short" }));
  assert.throws(() => sessionSecret({ ...env, DEMO_SESSION_SECRET: env.NAIJA_TEST_API_KEY }));
});
test("event retrieval authenticates only server-side, uses implemented paths and strips private extras", async () => {
  const s = setup();
  s.state.responseExtra = true;
  const result = await s.request("/api/events");
  assert.equal(result.status, 200);
  assert.equal(result.payload.data.events[0].id, ids.event);
  assert.ok(
    s.calls.every((c) => c.options.headers.Authorization === "Bearer " + env.NAIJA_TEST_API_KEY),
  );
  assert.ok(s.calls.every((c) => !Object.hasOwn(c.options.headers, "Origin")));
  const output = JSON.stringify(result.payload);
  for (const secret of [
    env.NAIJA_TEST_API_KEY,
    env.DEMO_SESSION_SECRET,
    "must-not-leak",
    "private@example.test",
  ])
    assert.ok(!output.includes(secret));
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
});
test("a test-looking credential cannot bypass a server identity reporting live mode", async () => {
  const s = setup();
  s.state.identityMode = "live";
  const r = await s.request("/api/events");
  assert.equal(r.status, 503);
  assert.equal(r.payload.error.code, "LIVE_SOURCE_BLOCKED");
  assert.equal(s.calls.length, 1);
});
test("monitor verifies real read responses but does not claim payment, ticket or webhook tests passed", async () => {
  const s = setup();
  const r = await s.request("/api/status");
  assert.equal(r.payload.data.connection, "connected");
  const states = Object.fromEntries(r.payload.data.checks.map((x) => [x.id, x.state]));
  assert.equal(states.authentication, "ready");
  assert.equal(states.events, "ready");
  assert.equal(states.checkout, "ready");
  assert.equal(states.payments, "manual");
  assert.equal(states.tickets, "manual");
  assert.equal(states.webhooks, "unavailable");
});
test("ordinary and group ticket availability follow the upstream admission/package contract", async () => {
  const s = setup();
  const r = await s.request("/api/event?id=" + ids.event);
  assert.equal(r.status, 200);
  const group = r.payload.data.tickets.find((t) => t.id === ids.group);
  assert.equal(group.admissions_per_ticket, 5);
  assert.equal(group.remaining_packages, 50);
  assert.equal(group.advisory, true);
});
test("secure browser session uses HttpOnly SameSite cookies; Unicode CSRF values fail safely", async () => {
  const s = setup();
  const r = await s.request("/api/bootstrap");
  assert.equal(r.payload.data.csrf_token.length, 43);
  assert.match(r.response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.ok(!r.payload.data.csrf_token.includes(env.DEMO_SESSION_SECRET));
  assert.equal(sameSecret("a".repeat(43), "é".repeat(43)), false);
  const prod = setup({ NODE_ENV: "production", PARTNER_ORIGIN: "https://partner.example.test" });
  assert.match((await prod.request("/api/bootstrap")).response.headers.get("set-cookie"), /Secure/);
});
test("checkout requires a valid browser, same origin and CSRF token before any upstream writes", async () => {
  const s = setup();
  assert.equal((await s.request("/api/checkout", { method: "POST", body: s.cart() })).status, 401);
  await s.request("/api/bootstrap");
  for (const headers of [
    { Origin: "https://evil.example" },
    { "X-Demo-CSRF": "" },
    { "X-Demo-CSRF": "é".repeat(43) },
  ])
    assert.equal(
      (await s.request("/api/checkout", { method: "POST", body: s.cart(), headers })).status,
      403,
    );
  assert.equal(s.calls.length, 0);
});
test("group checkout sends only package selections and server-owned returns; replay recovers one session and browser ownership", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  const cart = s.cart(2, ids.group);
  const first = await s.request("/api/checkout", { method: "POST", body: cart });
  const retry = await s.request("/api/checkout", { method: "POST", body: cart });
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(first.payload.data.checkout_url, retry.payload.data.checkout_url);
  assert.equal(s.sessions.size, 1);
  const writes = s.calls.filter((c) => c.options.method === "POST");
  assert.equal(
    writes[0].options.headers["Idempotency-Key"],
    writes[1].options.headers["Idempotency-Key"],
  );
  const data = JSON.parse(writes[0].options.body);
  assert.equal(data.items[0].quantity, 2);
  assert.equal(data.return_url, env.PARTNER_ORIGIN + "/confirmation");
  assert.equal(data.cancel_url, data.return_url);
  assert.deepEqual(Object.keys(data).sort(), ["cancel_url", "event_id", "items", "return_url"]);
  assert.ok(!JSON.stringify(first.payload).includes(env.NAIJA_TEST_API_KEY));
  assert.match(first.response.headers.get("set-cookie"), /demo_bookings=/);
  const result = await s.request("/api/confirmation?session=" + ids.booking);
  assert.equal(result.payload.data.booking.admissions, 10);
});
test("same intent with changed selection receives upstream idempotency conflict", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  assert.equal((await s.request("/api/checkout", { method: "POST", body: s.cart() })).status, 200);
  const conflict = await s.request("/api/checkout", { method: "POST", body: s.cart(2) });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.payload.error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(s.sessions.size, 1);
});
test("price, buyer identity, arbitrary returns and duplicate/invalid package quantities cannot be supplied by the browser", async () => {
  for (const change of [
    { price_kobo: 1 },
    { customer_id: ids.event },
    { return_url: "https://evil.example" },
    { purchaser: { email: "other@example.test" } },
    {
      items: [
        { ticket_type_id: ids.single, quantity: 1 },
        { ticket_type_id: ids.single, quantity: 1 },
      ],
    },
    { items: [{ ticket_type_id: ids.single, quantity: -1 }] },
    { items: [{ ticket_type_id: ids.single, quantity: 1.5 }] },
    { items: [{ ticket_type_id: ids.single, quantity: 21 }] },
  ]) {
    const s = setup();
    await s.request("/api/bootstrap");
    const result = await s.request("/api/checkout", {
      method: "POST",
      body: { ...s.cart(), ...change },
    });
    assert.equal(result.status, 400);
    assert.equal(s.sessions.size, 0);
  }
});
test("fresh stock and price validation prevents excess selection before hosted intent creation", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  s.state.availability = 1;
  const result = await s.request("/api/checkout", { method: "POST", body: s.cart(2) });
  assert.equal(result.status, 409);
  assert.equal(s.sessions.size, 0);
  s.state.price = Number.MAX_SAFE_INTEGER + 1;
  assert.equal((await s.request("/api/event?id=" + ids.event)).status, 502);
});
test("an arbitrary checkout redirect or mismatched admissions fails closed", async () => {
  for (const checkoutUrl of [
    "https://evil.example/steal",
    "javascript:alert(1)",
    env.NAIJA_API_ORIGIN +
      "/integrations/checkout/" +
      ids.booking +
      "?access=" +
      "c".repeat(64) +
      "&extra=1",
  ]) {
    const s = setup();
    s.state.checkoutUrl = checkoutUrl;
    await s.request("/api/bootstrap");
    const result = await s.request("/api/checkout", { method: "POST", body: s.cart() });
    assert.equal(result.status, 502);
    assert.equal(result.response.headers.get("set-cookie"), null);
  }
  const s = setup();
  s.state.admissions = 7;
  await s.request("/api/bootstrap");
  assert.equal((await s.request("/api/checkout", { method: "POST", body: s.cart() })).status, 502);
});
test("forged paid return never overrides pending, failed, expired, cancelled or refunded server states", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  await s.request("/api/checkout", { method: "POST", body: s.cart() });
  for (const status of [
    "pending",
    "failed",
    "expired",
    "cancelled",
    "refunded",
    "partially_refunded",
  ]) {
    s.state.orderStatus = status;
    const r = await s.request("/api/confirmation?session=" + ids.booking + "&nt_status=paid");
    assert.equal(r.payload.data.booking.status, status);
  }
});
test("confirmation requires an unmodified buyer cookie; arbitrary and other-browser sessions remain private", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  await s.request("/api/checkout", { method: "POST", body: s.cart() });
  assert.equal((await s.request("/api/confirmation?session=" + ids.intent)).status, 404);
  assert.equal(
    (await s.request("/api/confirmation?session=" + ids.booking, { ownCookies: false })).status,
    401,
  );
  const changed = s.jar().replace("demo_bookings=", "demo_bookings=changed");
  assert.equal(
    (await s.request("/api/confirmation?session=" + ids.booking, { headers: { Cookie: changed } }))
      .status,
    404,
  );
  const other = setup();
  await other.request("/api/bootstrap");
  assert.equal((await other.request("/api/confirmation?session=" + ids.booking)).status, 404);
});
test("only server-paid status confirms payment and group unclaimed slots do not fabricate issued QR tickets", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  await s.request("/api/checkout", { method: "POST", body: s.cart(2, ids.group) });
  s.state.orderStatus = "paid";
  let r = await s.request("/api/confirmation?session=" + ids.booking);
  assert.equal(r.payload.data.booking.status, "paid");
  assert.equal(r.payload.data.booking.admissions, 10);
  assert.equal(r.payload.data.booking.tickets_issued, 0);
  assert.equal(r.payload.data.account_url, env.NAIJA_API_ORIGIN + "/account");
  s.state.ticketsIssued = 2;
  r = await s.request("/api/confirmation?session=" + ids.booking);
  assert.equal(r.payload.data.booking.tickets_issued, 2);
  assert.ok(!JSON.stringify(r.payload).includes("qr"));
});
test("partner webhook endpoint rejects every unsigned or invented signed delivery instead of acknowledging it", async () => {
  const s = setup();
  for (const headers of [
    {},
    { "x-naija-signature": "fake" },
    { Authorization: "Bearer invented" },
  ]) {
    const r = await s.request("/api/webhooks/naija-tickets", {
      method: "POST",
      body: { type: "order.paid" },
      headers,
    });
    assert.equal(r.status, 501);
    assert.equal(r.payload.error.code, "WEBHOOKS_NOT_SUPPORTED");
  }
  assert.equal((await s.request("/api/webhooks/naija-tickets")).status, 405);
  assert.equal(s.sessions.size, 0);
  assert.equal(s.calls.length, 0);
});
test("upstream failures and malformed replies cannot leak raw secrets into browser errors or logs", async () => {
  const s = setup();
  s.state.errorCode = "SQL_PRIVATE_FAILURE";
  s.state.errorMessage = env.NAIJA_TEST_API_KEY + env.DEMO_SESSION_SECRET;
  const r = await s.request("/api/events");
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify([r.payload, s.logs]).includes(env.NAIJA_TEST_API_KEY));
  assert.ok(!JSON.stringify([r.payload, s.logs]).includes(env.DEMO_SESSION_SECRET));
  const client = createNaijaClient({
    env,
    fetchImpl: async () => new Response("Payload Too Large", { status: 413 }),
  });
  await assert.rejects(() => client.events(), /unreadable/);
});
test("bounded JSON, methods and checkout request budget reject bad requests", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  assert.equal(
    (await s.request("/api/checkout", { method: "POST", body: "x".repeat(17000) })).status,
    413,
  );
  assert.equal((await s.request("/api/checkout", { method: "POST", body: "{" })).status, 400);
  assert.equal(
    (
      await s.request("/api/checkout", {
        method: "POST",
        body: s.cart(),
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    415,
  );
  assert.equal((await s.request("/api/events", { method: "POST" })).status, 405);
  for (let i = 0; i < 7; i++) await s.request("/api/checkout", { method: "POST", body: s.cart() });
  const limited = await s.request("/api/checkout", { method: "POST", body: s.cart() });
  assert.equal(limited.status, 429);
  assert.equal(limited.response.headers.get("retry-after"), "60");
});
test("session expiry, malformed signatures and purpose-separated cookies fail closed", async () => {
  const s = setup();
  await s.request("/api/bootstrap");
  s.tick(8 * 24 * 60 * 60 * 1000);
  assert.equal((await s.request("/api/checkout", { method: "POST", body: s.cart() })).status, 401);
  const signed = signCookie(
    { id: ids.intent, exp: Math.floor(Date.now() / 1000) + 100 },
    "bookings",
    env,
  );
  assert.equal(
    (
      await s.request("/api/checkout", {
        method: "POST",
        body: s.cart(),
        headers: { Cookie: "demo_browser=" + signed },
      })
    ).status,
    401,
  );
});
test("identity is revalidated after the short cache window and unavailable checkout stays disabled", async () => {
  const s = setup();
  await s.request("/api/events");
  s.tick(21000);
  s.state.authStatus = 401;
  assert.equal((await s.request("/api/events")).status, 503);
  const disabled = setup();
  disabled.state.checkoutEnabled = false;
  await disabled.request("/api/bootstrap");
  assert.equal(
    (await disabled.request("/api/checkout", { method: "POST", body: disabled.cart() })).status,
    503,
  );
  assert.equal(disabled.sessions.size, 0);
});
test("snapshot schemas agree with fixture fields and confirmation projection contains no private order data", async () => {
  const spec = JSON.parse(
    readFileSync(new URL("../docs/naija-api-phase3.snapshot.json", import.meta.url), "utf8"),
  );
  const s = setup();
  await s.request("/api/bootstrap");
  await s.request("/api/checkout", { method: "POST", body: s.cart() });
  const r = await s.request("/api/confirmation?session=" + ids.booking);
  assert.deepEqual(
    Object.keys(r.payload.data.booking).sort(),
    spec.components.schemas.CheckoutSession.required.toSorted(),
  );
  const output = JSON.stringify(r.payload.data);
  for (const field of [
    "purchaser_email",
    "qr_token",
    "order_reference",
    "capability_hash",
    "checkout_url",
  ])
    assert.ok(!output.includes(field));
});
test("Node/Vercel adapter preserves cookies, JSON request bodies and explicit rewrite routing", async (t) => {
  const s = setup();
  const server = createServer((req, res) => nodeResponse(req, res, s.app));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  const bootstrap = await fetch(base + "/api/index?route=bootstrap");
  assert.equal(bootstrap.status, 200);
  const boot = await bootstrap.json();
  const browserCookie = bootstrap.headers.get("set-cookie").split(";")[0];
  const response = await fetch(base + "/api/index?route=checkout", {
    method: "POST",
    headers: {
      Cookie: browserCookie,
      Origin: env.PARTNER_ORIGIN,
      "X-Demo-CSRF": boot.data.csrf_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(s.cart()),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /demo_bookings=/);
  assert.equal((await response.json()).data.session_id, ids.booking);
});

test("free bookings display verified zero totals without a separate partner charge", async () => {
  const s = setup();
  s.state.price = 0;
  s.state.orderStatus = "paid";
  s.state.ticketsIssued = 1;
  await s.request("/api/bootstrap");
  await s.request("/api/checkout", { method: "POST", body: s.cart() });
  const result = await s.request("/api/confirmation?session=" + ids.booking);
  assert.equal(result.payload.data.booking.total_kobo, 0);
  assert.equal(result.payload.data.booking.status, "paid");
  assert.ok(
    s.calls.every(
      (call) => new URL(env.NAIJA_API_ORIGIN + call.path).hostname === "sandbox.example.test",
    ),
  );
});

test("Vercel pre-parsed JSON request bodies preserve the same protected checkout flow", async () => {
  const s = setup();
  const boot = await s.request("/api/bootstrap");
  const sent = new Map();
  let result;
  const req = {
    url: "/api/index?route=checkout",
    method: "POST",
    headers: {
      cookie: s.jar(),
      origin: env.PARTNER_ORIGIN,
      "content-type": "application/json",
      "x-demo-csrf": boot.payload.data.csrf_token,
    },
    body: s.cart(),
  };
  const res = {
    statusCode: 0,
    setHeader: (name, value) => sent.set(name.toLowerCase(), value),
    end: (value) => {
      result = JSON.parse(value.toString());
    },
  };
  await nodeResponse(req, res, s.app);
  assert.equal(res.statusCode, 200);
  assert.equal(result.data.session_id, ids.booking);
  assert.ok(Array.isArray(sent.get("set-cookie")));
});
