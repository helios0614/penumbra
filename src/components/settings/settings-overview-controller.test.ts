import { describe, expect, it, vi } from "vitest";

import type { SettingsOverview } from "@/application/settings-overview";
import {
  createSettingsOverviewController,
  type SettingsOverviewState,
} from "@/components/settings/settings-overview-controller";
import { ApiError } from "@/lib/api";

describe("settings overview controller", () => {
  it("transitions from idle to loading and success", async () => {
    const pending = deferred<SettingsOverview>();
    const controller = createSettingsOverviewController(() => pending.promise);
    const states: SettingsOverviewState[] = [];
    controller.subscribe((state) => states.push(state));

    expect(controller.getState().status).toBe("idle");
    const load = controller.load();
    expect(controller.getState().status).toBe("loading");
    pending.resolve(overview("model-a"));
    await load;

    expect(controller.getState()).toEqual({
      status: "success",
      data: overview("model-a"),
      error: null,
    });
    expect(states.map((state) => state.status)).toEqual(["loading", "success"]);
  });

  it("publishes errors and supports retry", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("safe failure", 503))
      .mockResolvedValueOnce(overview("model-b"));
    const controller = createSettingsOverviewController(loader);

    await controller.load();
    expect(controller.getState()).toMatchObject({ status: "error" });
    await controller.load();
    expect(controller.getState()).toMatchObject({
      status: "success",
      data: { readiness: { modelKey: "model-b" } },
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not publish abort as an error and aborts on dispose", async () => {
    let callerSignal: AbortSignal | undefined;
    const loader = vi.fn((options) => {
      callerSignal = options?.signal;
      return abortableOverview(options?.signal);
    });
    const controller = createSettingsOverviewController(loader);
    const listener = vi.fn();
    controller.subscribe(listener);

    const load = controller.load();
    controller.dispose();
    await load;

    expect(callerSignal?.aborted).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ status: "loading" });
  });

  it("prevents an older request from overwriting a newer retry", async () => {
    const first = deferred<SettingsOverview>();
    const second = deferred<SettingsOverview>();
    const loader = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createSettingsOverviewController(loader);

    const firstLoad = controller.load();
    const secondLoad = controller.load();
    second.resolve(overview("new-model"));
    await secondLoad;
    first.resolve(overview("old-model"));
    await firstLoad;

    expect(controller.getState()).toMatchObject({
      status: "success",
      data: { readiness: { modelKey: "new-model" } },
    });
  });

  it("cleans up the first Strict Mode lifecycle without leaking updates", async () => {
    let firstSignal: AbortSignal | undefined;
    const firstListener = vi.fn();
    const first = createSettingsOverviewController((options) => {
      firstSignal = options?.signal;
      return abortableOverview(options?.signal);
    });
    first.subscribe(firstListener);
    const firstLoad = first.load();
    first.dispose();

    const second = createSettingsOverviewController(() =>
      Promise.resolve(overview("strict-mode-model")),
    );
    await second.load();
    await firstLoad;

    expect(firstSignal?.aborted).toBe(true);
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(second.getState()).toMatchObject({ status: "success" });
  });
});

function overview(modelKey: string): SettingsOverview {
  return {
    session: { status: "authenticated" },
    models: [{ key: "model-a", label: "model-a", provider: "provider-a" }],
    readiness: {
      ready: true,
      modelKey,
      reason: "ready",
      setupActionRequired: false,
    },
  };
}

function abortableOverview(
  signal: AbortSignal | undefined,
): Promise<SettingsOverview> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError("aborted", 0, undefined, "ABORTED"));
      return;
    }
    signal?.addEventListener(
      "abort",
      () => reject(new ApiError("aborted", 0, undefined, "ABORTED")),
      { once: true },
    );
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
