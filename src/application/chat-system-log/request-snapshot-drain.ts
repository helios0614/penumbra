/** Page-owned mailbox scheduling. UI subscriptions never own a destructive read. */
export function createRequestSnapshotDrain(read: () => Promise<number | "unauthorized" | "unavailable">) {
  const active = new Set<symbol>();
  const graceMs = 180_000;
  const idleDelays = [2000, 4000, 8000, 16_000, 30_000];
  let until = 0, quiet = 0, failures = 0, nextAllowed = 0;
  let unavailable = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let due = 0;
  let flight: Promise<void> | undefined;
  const pending = () => active.size > 0 || Date.now() < until;
  const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
  function schedule(delay = 200) {
    if (unavailable || flight || !pending()) return;
    // Include a final grace read. A suspended tab may execute this timer late;
    // it still gets one read for any snapshots retained by the backend.
    const target = Math.max(nextAllowed, Math.min(Date.now() + delay, active.size ? Infinity : until));
    if (timer !== undefined && due <= target) return;
    cancelTimer(); due = target;
    timer = setTimeout(() => { timer = undefined; void drain(true); }, Math.max(0, target - Date.now()));
  }
  function request() {
    if (unavailable) return;
    until = Date.now() + graceMs; quiet = 0;
    schedule();
  }
  function drain(scheduled = false): Promise<void> {
    if (flight) return flight;
    if (unavailable || until === 0 || (!active.size && Date.now() > until && !scheduled)) return Promise.resolve();
    if (Date.now() < nextAllowed) { schedule(); return Promise.resolve(); }
    cancelTimer();
    flight = (async () => {
      try {
        const result = await read();
        if (result === "unauthorized" || result === "unavailable") {
          active.clear(); until = 0;
          quiet = 0; failures = 0; nextAllowed = 0;
          unavailable = result === "unavailable";
          return;
        }
        failures = 0;
        if (result > 0) { until = Date.now() + graceMs; quiet = 0; }
        else quiet++;
        nextAllowed = Date.now() + 2000;
      } catch {
        failures++;
        nextAllowed = Date.now() + Math.min(30_000, 2000 * 2 ** Math.min(failures, 4));
      } finally {
        flight = undefined;
        schedule(failures ? 0 : active.size ? 2000 : idleDelays[Math.min(Math.max(quiet - 1, 0), idleDelays.length - 1)]);
      }
    })();
    return flight;
  }
  return {
    start() {
      if (unavailable) return () => {};
      const owner = Symbol(); active.add(owner); request();
      return () => {
        if (!active.delete(owner)) return;
        request();
      };
    },
    request,
    drain,
    // Re-entry can resume a pending grace read, but cannot invent new demand.
    resume: () => schedule(),
    hasDemand: pending,
  };
}
