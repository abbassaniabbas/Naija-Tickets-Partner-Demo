import { createNaijaClient } from "../server/naija-client.mjs";
import { configuration, requiredScopes } from "../server/config.mjs";
try {
  configuration(process.env);
  const client = createNaijaClient({ env: process.env });
  const identity = await client.identity();
  const missing = requiredScopes.filter((scope) => !identity.scopes.includes(scope));
  if (missing.length) throw Error("Required demo scopes are missing: " + missing.join(", "));
  console.log("PASS: Test integration authentication and mode.");
  const list = await client.events();
  console.log("PASS: Assigned published event retrieval.");
  if (list.events[0]) {
    await client.tickets(list.events[0].id);
    console.log("PASS: Ticket types and advisory availability.");
  } else console.log("NOT TESTED: No assigned published sandbox events to check ticket types.");
  console.log(
    identity.capabilities.hosted_checkout && identity.capabilities.sandbox_purchases
      ? "READY, NOT TESTED: Hosted checkout requires a browser purchase."
      : "BLOCKED: Hosted checkout is not enabled on the sandbox.",
  );
  console.log(
    "NOT TESTED: Paystack payment, ticket issuance and email delivery require a browser acceptance test.",
  );
  console.log("UNAVAILABLE: Outgoing partner webhooks are not implemented in the current API.");
} catch {
  console.error(
    "BLOCKED: Configure a separate sandbox origin and valid Test API key, then retry. No payment was created.",
  );
  process.exitCode = 1;
}
