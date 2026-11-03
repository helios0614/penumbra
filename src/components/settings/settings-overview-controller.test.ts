import { describe, expect, it, vi } from "vitest";
import type { SettingsOverview, SettingsOverviewSection } from "@/application/settings-overview";
import { createSettingsOverviewController, type SettingsOverviewLoader } from "./settings-overview-controller";
import { ApiError } from "@/lib/api";

const values: SettingsOverview = {
  session: { status: "authenticated" },
  readiness: { ready: true, modelKey: "a", reason: "ready", setupActionRequired: false },
};
const success: SettingsOverviewLoader = async key => values[key];

describe("settings overview independent requests", () => {
  it("publishes fast items while another endpoint is pending", async () => {
    const pending = deferred<SettingsOverview["session"]>();
    const loader: SettingsOverviewLoader = key => key === "session" ? pending.promise as Promise<SettingsOverview[typeof key]> : success(key);
    const controller = createSettingsOverviewController(loader);
    const load = controller.load();
    expect(controller.getState().session.status).toBe("loading");
    await vi.waitFor(() => expect(controller.getState().readiness.status).toBe("success"));
    expect(controller.getState().readiness.status).toBe("success");
    expect(controller.getState().session.status).toBe("loading");
    pending.resolve(values.session); await load;
    expect(controller.getState().session).toMatchObject({ status: "success", data: values.session });
  });

  it.each(["session", "readiness"] as const)("isolates %s failure and retries only it", async failed => {
    let fail = true;
    const calls: SettingsOverviewSection[] = [];
    const loader: SettingsOverviewLoader = async key => {
      calls.push(key);
      if (key === failed && fail) throw new ApiError("safe failure", 503);
      return values[key];
    };
    const controller = createSettingsOverviewController(loader);
    await controller.load();
    for (const key of ["session", "readiness"] as const) expect(controller.getState()[key].status).toBe(key === failed ? "error" : "success");
    fail = false;
    await controller.load(failed);
    expect(controller.getState()[failed].status).toBe("success");
    expect(calls).toEqual(["session", "readiness", failed]);
  });

  it("blocks late success and failure from an older retry without affecting other items", async () => {
    const first = deferred<SettingsOverview["readiness"]>(), second = deferred<SettingsOverview["readiness"]>();
    let count = 0;
    const signals: AbortSignal[] = [];
    const loader: SettingsOverviewLoader = (key, options) => {
      if (key !== "readiness") return success(key);
      signals.push(options!.signal!);
      return (++count === 1 ? first.promise : second.promise) as Promise<SettingsOverview[typeof key]>;
    };
    const controller = createSettingsOverviewController(loader);
    const one = controller.load();
    const two = controller.load("readiness");
    second.resolve({ ...values.readiness, modelKey: "new" }); await two;
    first.reject(new Error("old failure")); await one;
    expect(signals[0].aborted).toBe(true);
    expect(controller.getState().readiness).toMatchObject({ status: "success", data: { modelKey: "new" } });
    expect(controller.getState().session.status).toBe("success");
  });

  it("prevents a late success from replacing a newer result", async () => {
    const first = deferred<SettingsOverview["session"]>(); let count = 0;
    const loader: SettingsOverviewLoader = key => key === "session" && ++count === 1 ? first.promise as Promise<SettingsOverview[typeof key]> : success(key);
    const controller = createSettingsOverviewController(loader);
    const old = controller.load("session"); await controller.load("session");
    first.resolve({ status: "unauthenticated" }); await old;
    expect(controller.getState().session).toMatchObject({ data: values.session });
  });

  it("aborts all items on unmount, ignores late results, and permits a fresh Strict Mode lifecycle", async () => {
    const pending = deferred<never>(), signals: AbortSignal[] = [];
    const controller = createSettingsOverviewController((_key, options) => { signals.push(options!.signal!); return pending.promise; });
    const listener = vi.fn(); controller.subscribe(listener);
    const load = controller.load(); controller.dispose();
    pending.reject(new ApiError("aborted", 0, undefined, "ABORTED")); await load;
    expect(signals).toHaveLength(2); expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    await controller.load(); expect(listener).toHaveBeenCalledTimes(2);
    const reopened = createSettingsOverviewController(success); await reopened.load();
    expect(reopened.getState().readiness.status).toBe("success");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
