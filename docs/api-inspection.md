# Inspected API contract

Inspected 15 October 2026 from the existing Naija Tickets implementation and Phase 3 OpenAPI. The main project was read only. A portable snapshot is committed here as `naija-api-phase3.snapshot.json`.

| Existing endpoint                                 | Required scope           | Demo use                                                                                           |
| ------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| GET `/api/v1/integration`                         | integration:read         | Test identity/capability handshake.                                                                |
| GET `/api/v1/events`                              | events:read              | Assigned published event catalogue; cursor pagination.                                             |
| GET `/api/v1/events/{eventId}`                    | events:read              | Event detail.                                                                                      |
| GET `/api/v1/events/{eventId}/tickets`            | tickets:read             | Current NGN kobo package prices and per-order limits.                                              |
| GET `/api/v1/events/{eventId}/availability`       | availability:read        | Advisory package/admission stock and current-price allocation.                                     |
| POST `/api/v1/checkout-sessions`                  | checkout:write           | Intent only; mandatory Idempotency-Key. Return/cancel origins registered in the sandbox dashboard. |
| GET `/api/v1/checkout-sessions/{sessionId}`       | orders:read              | Minimal authoritative status for this application only.                                            |
| GET `/integrations/checkout/{sessionId}?access=…` | Private buyer capability | Validated API result; top-level browser redirect only.                                             |

Requests use server-held Bearer credentials, no browser Origin header, documented snake_case bodies, and `{data,meta}` / `{error}` response envelopes. There are no direct frontend calls to the Naija Tickets API.

Ticket `quantity` means packages. `admissions_per_ticket` converts packages into admissions. Availability includes `remaining_packages` and `max_packages_at_current_price`; this demo caps selection to both, the tier's order limit and 20 packages, plus 400 admissions total. Availability remains advisory; the backend must atomically recheck when the hosted customer reserves. The displayed sum excludes fees/promos until the hosted backend calculates the final total.

Allowed session states are open, reserved, pending, paid, failed, expired, cancelled, refunded and partially_refunded. Only server status `paid` produces a paid confirmation. Browser return parameters are untrusted. Ordinary ticket issuance and group member claims are handled by the Naija Tickets system, not a partner API endpoint invented here.

The existing API returns no private receipt URL, QR code, buyer email, raw order reference, personal group ticket or invite. The partner therefore displays only documented counts and directs buyers to their Naija Tickets account. It cannot prove email delivery or individually scan a QR through this machine API.

## Webhook limitation

Phase 4 outgoing partner webhooks are not implemented. The existing `/api/payments/paystack/webhook` is an incoming Paystack endpoint on the **Naija Tickets backend**; it is not an outgoing partner delivery mechanism and must not be pointed at this demo.

There is no current partner event envelope, signing header, timestamp/replay specification, delivery registration or delivery-history endpoint to implement safely. The demo's reserved receiver rejects POSTs with 501 WEBHOOKS_NOT_SUPPORTED and other methods with 405. It stores no events and never updates payment state. Do not register it or claim delivery succeeds. Once the main platform separately implements and documents outgoing webhooks, a later change can add real signature verification, replay protection, durable deduplication/storage and verified-order reconciliation using that actual contract.

## Local partner endpoints

- GET `/api/bootstrap`: HttpOnly browser cookie and CSRF token; no machine key.
- GET `/api/status`: safe page-driven connection checks; no secret identifiers.
- GET `/api/events?cursor=…`: projected catalogue.
- GET `/api/event?id=…`: event/ticket/availability view.
- POST `/api/checkout`: signed browser + exact Origin + CSRF; strict selection only.
- GET `/api/confirmation?session=…`: signed browser booking ownership + authoritative API status.
- POST `/api/webhooks/naija-tickets`: explicitly unavailable (501), not an active receiver.
