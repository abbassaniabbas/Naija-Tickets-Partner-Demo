# Actual verification results

Completed 15 October 2026 (Africa/Lagos). Project: **Naija Tickets Partner Demo**. Visitor brand: **Lagos Events Demo**.

## Implemented and locally checked

- Responsive organiser homepage, event catalogue, local search/category filters, cursor load-more, event detail, single/group package selector, promo input, hosted redirect and verified-status confirmation.
- Separate server-only integration client using the inspected Phase 3 contract. No private API key is bundled into public assets.
- Browser-owned HMAC booking cookies, CSRF, strict selections, idempotent attempt recovery including blocked browser storage, current availability checks and validated sandbox-only redirects.
- Page-driven status monitoring with explicit separation between available capabilities and completed payment tests.
- Disabled webhook endpoint: POST 501, no delivery accepted or stored, no invented signing scheme.
- Standalone Vercel Node adapter, public-only output, security headers, local environment template, deployment guide and acceptance checklist.

| Check | Actual result |
| --- | --- |
| `npm ci --ignore-scripts` in final project | Exit 0; no third-party runtime dependencies. |
| `npm test` in final project | Exit 0; **27/27 passed**, 0 failed/skipped. |
| `npm run build` in final project | Exit 0; JS syntax, Vercel entrypoint/configuration and public secret-marker checks passed. |
| Standalone HTTP smoke checks | **14 passed**: homepage, JS/helper/CSS/favicon, integration/confirmation/event deep links; unconfigured events correctly 503; .env.local/server/test files 404; truthful monitoring; webhook delivery 501. |
| `.env.local` exclusion | `git check-ignore .env.local` confirms ignored; blank file has private file permissions. |
| `npm run test:sandbox` | **Blocked, exit 1 as expected**: separate sandbox URL/Test key missing. No real API/payment call or booking created. |
| Browser visual QA | Initial narrow in-app preview rendered the homepage and truthful setup state correctly. Further responsive/desktop/menu/positive-flow visual QA could not complete after the Mac locked. Do not treat those checks as passed. |
| Main application isolation | Main Git status before/after identical; all source changes made in the independent sibling project. No main migration, environment, API key, data or deployment changed. |

Logs are available locally at `/tmp/naija-partner-{install-final,tests-final,build-final,http-final,sandbox}.log`.

## What the automated tests prove

The tests use clearly labelled, in-memory API fixtures and actual local Node HTTP requests. They cover Test/Live/source isolation, server Bearer handling, public projections, mode/permission/capability handling, normal/group package data, cookie settings, same-origin/CSRF, idempotency/replay/conflict, price/customer/return tampering, stock/unsafe-money denial, redirect validation, forged paid URLs, ownership/expiry/cookie tampering, paid/pending/failed/expired/cancelled/refunded views, group unclaimed count handling, free zero totals, receiver rejection, secret-free failures, bounded JSON/methods/rate limits, identity cache expiry, contract field agreement, native stream and Vercel pre-parsed bodies, and browser-storage failure recovery.

A fixture returning `paid` only tests that this partner displays the documented authoritative status correctly. It does **not** verify a Paystack transaction or issue actual tickets. The public runtime never imports test fixtures.

## Not yet verified

The user confirmed the separate Naija Tickets sandbox is **not set up yet**. Therefore actual API authentication, sandbox event reads, real hosted checkout, Paystack test payment verification, database ticket issuance, organiser inventory/reporting and email receipt remain acceptance tasks. The partner cannot provision or bypass those external dependencies and never falls back to production.

Outgoing partner webhook delivery is additionally **unavailable in Naija Tickets Phase 3**. A current incoming Paystack webhook is a different backend feature. No partner delivery, signature verification or durable receiver deduplication is claimed. Its exact protocol must be implemented/documented by the platform before the partner receiver can be activated safely.

No GitHub repository, remote push, Vercel deployment, Supabase project, API credential, real/test provider payment, email or paid service was created in this task. A local Git repository exists on branch `codex/partner-demo`; project files are ready for review and the user's first commit.

## Next steps

1. Create/configure the separate Naija Tickets sandbox backend, isolated test database and Paystack test mode using the existing backend runbook.
2. Register this partner's exact Test origin and assigned events, and generate its Test key privately.
3. Fill this project's ignored .env.local, run `npm run test:sandbox`, then follow `testing-checklist.md` for actual browser/payment/issuance acceptance.
4. Deploy this project separately using `deployment.md`. Wider browser QA and real Vercel routing verification still need completion.
5. Keep webhook delivery marked unavailable until the platform separately supplies the implemented outgoing webhook contract.
