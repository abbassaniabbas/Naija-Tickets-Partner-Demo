export class DemoError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function uuid(value) {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new DemoError(400, "INVALID_REQUEST", "Choose a valid event or booking.");
  return value.toLowerCase();
}
export function exactOrigin(value, production = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DemoError(
      503,
      "DEMO_NOT_CONFIGURED",
      "The sandbox connection has not been configured.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(local && !production && url.protocol === "http:"))
  )
    throw new DemoError(
      503,
      "DEMO_NOT_CONFIGURED",
      "Use an exact HTTPS origin, or localhost HTTP for development.",
    );
  return url.origin;
}
export function configuration(env) {
  if (!env.NAIJA_API_ORIGIN || !env.NAIJA_TEST_API_KEY)
    throw new DemoError(
      503,
      "SANDBOX_NOT_CONFIGURED",
      "The separate Naija Tickets sandbox is not connected yet.",
    );
  const apiOrigin = exactOrigin(env.NAIJA_API_ORIGIN, env.NODE_ENV === "production");
  if (new URL(apiOrigin).hostname === "naija-tickets.vercel.app")
    throw new DemoError(
      503,
      "LIVE_SOURCE_BLOCKED",
      "Connect the separate sandbox website, not the live Naija Tickets site.",
    );
  if (!/^nt_test_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(env.NAIJA_TEST_API_KEY))
    throw new DemoError(
      503,
      "TEST_KEY_REQUIRED",
      "A valid sandbox Test API key is required. Live keys are blocked.",
    );
  return { apiOrigin, apiKey: env.NAIJA_TEST_API_KEY };
}
export function partnerOrigin(env) {
  return exactOrigin(
    env.PARTNER_ORIGIN || (env.NODE_ENV === "production" ? "" : "http://localhost:3001"),
    env.NODE_ENV === "production",
  );
}
export function sessionSecret(env) {
  const secret = env.DEMO_SESSION_SECRET;
  if (
    typeof secret !== "string" ||
    secret.length < 43 ||
    secret.length > 256 ||
    [env.NAIJA_TEST_API_KEY, env.PAYSTACK_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY]
      .filter(Boolean)
      .includes(secret)
  )
    throw new DemoError(
      503,
      "SESSION_NOT_CONFIGURED",
      "Secure booking sessions have not been configured.",
    );
  return secret;
}
export const requiredScopes = [
  "integration:read",
  "events:read",
  "tickets:read",
  "availability:read",
  "checkout:write",
  "orders:read",
];
