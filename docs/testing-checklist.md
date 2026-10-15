# Testing checklist

Use **isolated test data only**. Record the date, test deployment, expected/actual outcome and a private screenshot or non-secret request ID. Never record raw credentials, checkout access tokens, payment details, private receipt links or personal QR data in a public report.

## Automated local checks

- [ ] `npm ci` succeeds using Node 24.
- [ ] `npm test` passes all partner tests, including Node/Vercel HTTP adapter, cookies and rewrite routing.
- [ ] `npm run build` passes syntax/configuration/public-secret checks.
- [ ] Without environment settings, home and integration pages show an honest unconfigured state, not demo event cards or payment success.
- [ ] Browser console/network assets contain no Test API key, session signing secret, Supabase key or Paystack secret. Same-origin /api calls are expected.
- [ ] At 320px, 390px, tablet and desktop widths: no horizontal overflow; menu opens/closes with keyboard and touch; headings, ticket controls, status rows and confirmation fit.

## Real sandbox prerequisites — currently not complete

- [ ] Separate backend deployment and Supabase project exist; no production customer data copied.
- [ ] Backend is bound to test mode and the correct project, with Paystack test key and integration signing configured.
- [ ] Sandbox fixture organiser owns assigned published events and active ordinary/free/group tiers.
- [ ] Test key belongs to the sandbox project and has all six required scopes.
- [ ] Partner origin is explicitly registered as a Test website origin and matches PARTNER_ORIGIN.
- [ ] Partner server settings are installed privately; sensitive values are not committed.

## Authentication and reads

- [ ] `npm run test:sandbox` verifies actual Test identity and assigned published event/ticket/availability reads.
- [ ] Wrong/revoked/expired key fails and exposes no provider details.
- [ ] Missing scopes fail clearly.
- [ ] Test key against live backend is rejected; Live key is rejected by this demo before sending a request.
- [ ] Unknown, foreign, unassigned, draft, cancelled and ended events are unavailable.
- [ ] Real assigned events and API images appear; search/category/load-more work on actual returned records.
- [ ] Availability reflects package/admission units and current price allocation. Sold-out/upcoming/closed options cannot be selected.

## Hosted checkout and verified payment

- [ ] Select one ordinary ticket and continue; a valid hosted URL on the sandbox origin opens.
- [ ] Repeated click/network retry uses the same intent; no duplicate backend order or extra payment attempt.
- [ ] Changed payload with reused intent conflicts, and a new intentional booking uses a new intent.
- [ ] Browser-submitted price/customer ID/return URL is rejected.
- [ ] Buyer enters details only on Naija Tickets. Final fees and promo totals come from its stored order.
- [ ] Complete a Paystack **test** payment. Actual Naija Tickets server verification records paid status.
- [ ] Return to the same browser's partner confirmation. Paid appears only after server GET session status reports paid.
- [ ] Manually changing nt_status to paid cannot turn pending/failed/cancelled/expired into success.
- [ ] Cancellation and failed/late payment remain truthful; do not automatically start another charge when payment is uncertain.
- [ ] A free booking follows the backend's existing free issuance flow without opening a charge.
- [ ] Signed-in customer's purchase is visible in its Naija Tickets account; guest uses the original ticket email/access path.
- [ ] Confirmation is private to the initiating browser. Clearing/tampering with cookies or using an unrelated session ID cannot retrieve it.

## Tickets, groups, inventory and delivery

These must be checked on the actual Naija Tickets sandbox account/dashboard; the partner API exposes only aggregate counts, not private QR or ticket links.

- [ ] Ordinary verified purchase creates the correct unique tickets; refresh/callback repetition creates no duplicates.
- [ ] Two group-of-five packages reserve/sell **ten admissions**, not two.
- [ ] Paid unclaimed group slots do not have usable QR codes. Buyer can manage/share claims in Naija Tickets.
- [ ] Claim one attendee slot; issued/registered aggregate counts update in the partner confirmation.
- [ ] Unique claimed QR works with authorised entry staff, cannot be reused beyond its allowed admission and cannot be checked by an unrelated organiser.
- [ ] Order totals, inventory and organiser sales use verified payment data and remain separate from live reports/payouts.
- [ ] Existing backend confirmation email reaches only the controlled test recipient, where email is configured.
- [ ] Simulated/actual email failure does not invalidate a verified paid booking.

## Webhooks — blocked by platform support

- [x] Partner reserved endpoint rejects unsigned/invented signed events with 501 and never accepts a paid event. Covered by local tests.
- [ ] Main Naija Tickets outgoing webhook contract/delivery exists. **Currently unavailable; do not mark passed.**
- [ ] After that separate implementation: verify genuine raw-body signatures, timestamp/replay limits, secret rotation, invalid signatures, retries, duplicate/out-of-order delivery, durable event IDs and minimal data.
- [ ] Observe a real backend delivery and receiver acknowledgement, then reconcile against server order status.

The main platform must implement outgoing webhooks before the final two checks can run. No mocked receiver acknowledgement substitutes for delivery acceptance.
