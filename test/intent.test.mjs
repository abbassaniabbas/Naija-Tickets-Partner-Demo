import test from "node:test";
import assert from "node:assert/strict";
import { createIntentKeeper } from "../public/checkout-intent.js";
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
test("browser retries retain an intent even with disabled storage; changed cart starts a new intent", () => {
  const storage = {
    getItem() {
      throw Error("Disabled");
    },
    setItem() {
      throw Error("Disabled");
    },
  };
  let n = 0;
  const intent = createIntentKeeper({ storage, randomUUID: () => (++n === 1 ? a : b) });
  assert.equal(intent({ quantity: 1 }), a);
  assert.equal(intent({ quantity: 1 }), a);
  assert.equal(intent({ quantity: 2 }), b);
});
test("a reload recovers only a matching valid saved intent and ignores corrupt storage", () => {
  let saved;
  const storage = {
    getItem: () => saved,
    setItem: (_, value) => {
      saved = value;
    },
  };
  const first = createIntentKeeper({ storage, randomUUID: () => a });
  assert.equal(first({ quantity: 1 }), a);
  const reload = createIntentKeeper({ storage, randomUUID: () => b });
  assert.equal(reload({ quantity: 1 }), a);
  saved = JSON.stringify({ fingerprint: JSON.stringify({ quantity: 1 }), id: "bad-value" });
  assert.equal(createIntentKeeper({ storage, randomUUID: () => b })({ quantity: 1 }), b);
});
