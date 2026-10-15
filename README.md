# Naija Tickets Partner Demo

**Lagos Events Demo** is a fictional event organiser website and an external consumer of the Naija Tickets Phase 3 API. It is a separate, dependency-free Node 24/Vercel project. It does not modify, import server code from, or connect directly to the main application's database.

## Current status

The website and server integration are implemented. **The actual separate Naija Tickets sandbox has not been created yet**, as confirmed on 15 October 2026. Consequently no real sandbox credential, event, checkout, Paystack payment, ticket issuance, email or partner webhook delivery has been validated. The deployed/runtime website never substitutes sample events or simulated paid responses when the API is unavailable.

The current Naija Tickets API has **no outgoing partner webhook implementation or published signing contract**. This demo reserves `POST /api/webhooks/naija-tickets` but deliberately returns HTTP 501 for every delivery. It does not acknowledge or trust invented signatures. Payment confirmation uses the implemented server-side session status endpoint. See [API inspection](docs/api-inspection.md), [deployment](docs/deployment.md), [test checklist](docs/testing-checklist.md), and [actual verification results](docs/verification.md).

## Run locally

```sh
cd /Users/Abbas/Documents/Projects/Naija-Tickets-Partner-Demo
npm ci
npm run dev
```

Open `http://localhost:3001`. A blank, ignored `.env.local` is provided. Until configured, the website opens normally and shows a clear sandbox setup state. It will not list imaginary events or start live payments.

When the separate backend sandbox is ready, edit `.env.local` locally:

```dotenv
NAIJA_API_ORIGIN=https://YOUR-SEPARATE-NAIJA-SANDBOX.vercel.app
NAIJA_TEST_API_KEY=YOUR-SANDBOX-TEST-KEY
PARTNER_ORIGIN=http://localhost:3001
DEMO_SESSION_SECRET=YOUR-DEDICATED-RANDOM-SECRET
PORT=3001
```

The origin values must contain only the scheme and hostname/port, with no path, query, fragment or credentials. Generate the session secret privately:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Restart after changing settings. Keep `.env.local` out of Git and do not paste credentials into chat, screenshots, logs or browser code. The partner needs **no Paystack secret and no Supabase key**. Paystack test mode belongs on the separate Naija Tickets backend.

## Implemented flow

1. Browser → this project's same-origin API → Naija Tickets sandbox, with the Test credential added **only by the server**.
2. Identity handshake verifies Test mode and current supported capabilities. All six scopes are required for the complete demo: `integration:read`, `events:read`, `tickets:read`, `availability:read`, `checkout:write`, `orders:read`.
3. Event list/detail and ticket availability are retrieved through implemented, assigned-event API reads. Prices and quantities are never hardcoded into public runtime data.
4. Buyer selects package quantities. The server rechecks current event/ticket data, validates stock/order limits and sends an idempotent hosted intent with server-owned return/cancel URLs. It does not reserve inventory or collect attendee/payment details itself.
5. Naija Tickets hosts the real checkout and handles its existing Paystack test verification, reservations, ordinary tickets/group claims and email mechanisms.
6. The buyer returns here. This server checks a signed browser booking cookie and retrieves authoritative session status. A forged `nt_status=paid` URL cannot confirm a purchase.
7. Paid confirmations show verified order amounts, purchased admissions and issued/registered aggregate counts. Private QR codes, group invites, order references and ticket URLs are not available in this API, so this site does not invent them. Buyers use their Naija Tickets account or original ticket email.

The partner has no separate payment ledger, ticket generator or database. The last eight checkout IDs are remembered in a signed HttpOnly browser cookie for up to seven days. Use the same browser for return confirmation; private browsing, cleared cookies or a changed signing secret prevent restoration. Tickets remain managed by Naija Tickets.

## Project structure

- `public/`: static website, CSS, browser JavaScript and user-supplied Lagos city photograph.
- `server/naija-client.mjs`: bounded server API client, Test-mode handshake, projections and safe redirects.
- `server/app.mjs`: same-origin browser endpoints, secure selection validation and monitoring.
- `server/session.mjs`: purpose-separated HMAC cookies, CSRF and browser-bound idempotency.
- `api/index.mjs`: Vercel Node function adapter.
- `scripts/dev.mjs`: standalone local preview/server.
- `test/`: labelled API fixtures and automated tests; fixtures are not imported by public/runtime application code.
- `docs/naija-api-phase3.snapshot.json`: read-only inspected API contract snapshot, not a modified main-project specification.

## Checks

```sh
npm test
npm run build
npm run test:sandbox
```

`npm test` uses in-memory, explicitly fictitious API responses and a local HTTP adapter test. It tests partner behaviour, not real provider payment or database ticket issuance. The build checks JavaScript syntax, Vercel entrypoint configuration and browser assets for secret markers. `test:sandbox` performs real **read-only** authentication/event/ticket checks once configured and fails clearly while unconfigured; it never purchases tickets.

Integration status is available at `/integration`. It refreshes every minute while visible. Authentication and catalogue checks make real server requests; checkout availability reflects API capabilities/configuration, not proof of a completed payment. Payment/ticket issuance remain manual checks. This is page-driven monitoring, not a background uptime service or durable audit log.

## Security and limits

Live credentials and the known production API hostname are rejected. The API's own environment binding must additionally prevent Test keys from accessing live data. The server rejects client prices/customer details/return destinations, unsafe upstream checkout URLs, oversized JSON and inappropriate methods. It uses bounded upstream responses/timeouts, secure-cookie settings, same-origin CSRF checks and secret-free errors/logs. Browser API responses are private/no-store. Public text uses `textContent`, with restrictive CSP and no third-party scripts.

The checkout budget is per browser/per process; Naija Tickets retains its own shared API rate limits. This small demo has no external queue, shared session store, persistent telemetry, outgoing webhook infrastructure or cron task. A public traffic launch would need appropriate abuse protection and operational review beyond this test site.

## Deploy separately

Follow [the Vercel deployment guide](docs/deployment.md). The new project name is **Naija Tickets Partner Demo** (Vercel slug `naija-tickets-partner-demo`), and the visitor-facing brand is **Lagos Events Demo**. Do not select the main Naija Tickets Vercel project. No GitHub repository, Vercel deployment, paid service or production configuration was created automatically.
