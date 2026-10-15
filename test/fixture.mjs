import { createHash } from "node:crypto";
import { requiredScopes } from "../server/config.mjs";
export const ids = {
  event: "30000000-0000-4000-8000-000000000001",
  single: "40000000-0000-4000-8000-000000000001",
  group: "40000000-0000-4000-8000-000000000002",
  booking: "50000000-0000-4000-8000-000000000001",
  intent: "60000000-0000-4000-8000-000000000001",
};
export const env = {
  NAIJA_API_ORIGIN: "https://sandbox.example.test",
  NAIJA_TEST_API_KEY: "nt_test_" + "a".repeat(32) + "_" + "B".repeat(43),
  PARTNER_ORIGIN: "http://localhost:3001",
  DEMO_SESSION_SECRET: "local-automated-test-fixture-not-a-real-secret-" + "x".repeat(24),
};
export const event = {
  id: ids.event,
  title: "Fixture — Lagos Sound Test",
  slug: "fixture-lagos-sound",
  description: "Fictitious automated test data. Not an actual event listing.",
  image_url: null,
  starts_at: "2030-11-01T19:00:00+01:00",
  ends_at: "2030-11-02T01:00:00+01:00",
  timezone: "Africa/Lagos",
  sales_start_at: null,
  sales_end_at: null,
  venue: { name: "Fixture Hall", address: "Test address", city: "Lagos", state: "Lagos" },
  organiser: { id: ids.event, name: "Fixture organiser", verified: true },
  category: { id: ids.event, name: "Music", slug: "music" },
};
export function fixture() {
  const calls = [],
    sessions = new Map();
  const state = {
    identityMode: "test",
    authStatus: 200,
    availability: 50,
    checkoutEnabled: true,
    orderStatus: "pending",
    ticketsIssued: 0,
    errorCode: null,
    errorMessage: null,
    checkoutUrl: null,
    admissions: null,
    eventTitle: event.title,
    price: 1500000,
    responseExtra: false,
  };
  const tickets = () => [
    {
      id: ids.single,
      event_id: ids.event,
      name: "General admission",
      description: "Single admission test fixture.",
      currency: "NGN",
      price_kobo: state.price,
      standard_price_kobo: 1500000,
      price_kind: "standard",
      early_bird_price_kobo: null,
      early_bird_ends_at: null,
      admissions_per_ticket: 1,
      min_packages_per_order: 1,
      max_packages_per_order: 20,
      sales_start_at: null,
      sales_end_at: null,
      sale_status: "open",
      fees_included: false,
      promo_discount_included: false,
    },
    {
      id: ids.group,
      event_id: ids.event,
      name: "Squad Pass",
      description: "Five admissions per package.",
      currency: "NGN",
      price_kobo: 4500000,
      standard_price_kobo: 4500000,
      price_kind: "standard",
      early_bird_price_kobo: null,
      early_bird_ends_at: null,
      admissions_per_ticket: 5,
      min_packages_per_order: 1,
      max_packages_per_order: 20,
      sales_start_at: null,
      sales_end_at: null,
      sale_status: "open",
      fees_included: false,
      promo_discount_included: false,
    },
  ];
  const availability = () => ({
    event_id: ids.event,
    as_of: new Date().toISOString(),
    advisory: true,
    total_admissions: 100,
    sold_admissions: 0,
    reserved_admissions: 0,
    remaining_admissions: 100,
    ticket_types: tickets().map((t) => ({
      ticket_type_id: t.id,
      admissions_per_ticket: t.admissions_per_ticket,
      total_admissions: 100,
      sold_admissions: 0,
      reserved_admissions: 0,
      remaining_admissions: state.availability * t.admissions_per_ticket,
      remaining_packages: state.availability,
      early_bird_remaining_packages: null,
      max_packages_at_current_price: state.availability,
      sale_status: "open",
    })),
  });
  function snapshot(intent, id = ids.booking) {
    const admissions =
      state.admissions ??
      intent.items.reduce(
        (sum, item) => sum + item.quantity * (item.ticket_type_id === ids.group ? 5 : 1),
        0,
      );
    const subtotal = intent.items.reduce(
      (sum, item) =>
        sum + item.quantity * (item.ticket_type_id === ids.group ? 4500000 : state.price),
      0,
    );
    return {
      id,
      event_id: ids.event,
      environment: "test",
      status: state.orderStatus,
      expires_at: "2030-11-01T19:30:00Z",
      reservation_expires_at: "2030-11-01T19:10:00Z",
      currency: "NGN",
      admissions,
      subtotal_kobo: subtotal,
      discount_kobo: 0,
      fee_kobo: subtotal / 20,
      total_kobo: subtotal + subtotal / 20,
      tickets_issued: state.ticketsIssued,
      members_registered: 0,
    };
  }
  async function fetchImpl(input, options = {}) {
    const url = new URL(input);
    calls.push({ path: url.pathname + url.search, options });
    const response = (data, status = 200) =>
      Response.json({ data, meta: { request_id: ids.intent, next_cursor: null } }, { status });
    if (state.errorCode)
      return Response.json(
        { error: { code: state.errorCode, message: state.errorMessage || "Server-only detail" } },
        { status: 503 },
      );
    if (url.pathname === "/api/v1/integration")
      return state.authStatus === 200
        ? response({
            environment: state.identityMode,
            scopes: requiredScopes,
            capabilities: {
              event_api: true,
              hosted_checkout: state.checkoutEnabled,
              sandbox_purchases: state.checkoutEnabled,
            },
          })
        : Response.json(
            { error: { code: "INVALID_API_KEY", message: "Private detail" } },
            { status: state.authStatus },
          );
    if (url.pathname === "/api/v1/events")
      return response([
        {
          ...event,
          title: state.eventTitle,
          ...(state.responseExtra
            ? {
                secret_field: "must-not-leak",
                organiser: { ...event.organiser, contact_email: "private@example.test" },
              }
            : {}),
        },
      ]);
    if (url.pathname === "/api/v1/events/" + ids.event)
      return response({ ...event, title: state.eventTitle });
    if (url.pathname.endsWith("/tickets")) return response(tickets());
    if (url.pathname.endsWith("/availability")) return response(availability());
    if (url.pathname === "/api/v1/checkout-sessions" && options.method === "POST") {
      const intent = JSON.parse(options.body),
        idem = options.headers["Idempotency-Key"],
        hash = createHash("sha256").update(options.body).digest("hex");
      if (sessions.has(idem) && sessions.get(idem).hash !== hash)
        return Response.json(
          { error: { code: "IDEMPOTENCY_CONFLICT", message: "Changed" } },
          { status: 409 },
        );
      if (!sessions.has(idem)) sessions.set(idem, { hash, intent });
      return response({
        ...snapshot(intent),
        checkout_url:
          state.checkoutUrl ||
          env.NAIJA_API_ORIGIN +
            "/integrations/checkout/" +
            ids.booking +
            "?access=" +
            "c".repeat(64),
      });
    }
    if (url.pathname === "/api/v1/checkout-sessions/" + ids.booking)
      return response(
        snapshot(
          sessions.values().next().value?.intent || {
            items: [{ ticket_type_id: ids.single, quantity: 1 }],
          },
        ),
      );
    throw Error("Unexpected fixture request: " + url.pathname);
  }
  return { fetchImpl, calls, state, sessions, tickets, availability };
}
