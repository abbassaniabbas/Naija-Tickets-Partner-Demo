// Stores an opaque purchase-attempt ID, never a credential, receipt or attendee data.
export function createIntentKeeper({ storage, randomUUID = () => crypto.randomUUID() } = {}) {
  let memory = null;
  return (payload) => {
    const fingerprint = JSON.stringify(payload);
    if (memory?.fingerprint === fingerprint) return memory.id;
    try {
      const saved = JSON.parse(storage?.getItem("lagos_checkout_intent") || "null");
      if (
        saved?.fingerprint === fingerprint &&
        typeof saved.id === "string" &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(saved.id)
      )
        memory = saved;
    } catch {
      /* Browser storage may be unavailable. Memory still protects retries. */
    }
    if (memory?.fingerprint !== fingerprint) memory = { fingerprint, id: randomUUID() };
    try {
      storage?.setItem("lagos_checkout_intent", JSON.stringify(memory));
    } catch {
      /* Optional persistence. */
    }
    return memory.id;
  };
}
