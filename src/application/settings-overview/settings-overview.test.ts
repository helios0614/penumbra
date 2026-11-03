import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadSettingsOverview } from "@/application/settings-overview";
import { ApiError } from "@/lib/api";

describe("settings overview application", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads only session and default readiness in parallel", async () => {
    const session = deferred<Response>();
    const readiness = deferred<Response>();
    fetchMock.mockImplementation((input) => {
      const path = String(input);
      if (path === "/api/session") return session.promise;
      return readiness.promise;
    });

    const pending = loadAllOverview({ timeoutMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    session.resolve(json({ authenticated: true }));
    readiness.resolve(json(readinessDto("ready", "model-a")));

    await expect(pending).resolves.toEqual({
      session: { status: "authenticated" },
      readiness: {
        ready: true,
        modelKey: "model-a",
        reason: "ready",
        setupActionRequired: false,
      },
    });
    expect(paths()).toEqual([
      "/api/session",
      "/api/chat/readiness",
    ]);
  });

  it("keeps an unknown readiness model without inferring a catalog default", async () => {
    mockSafeOverview({

      readiness: readinessDto("unknown_model", "future/model-key"),
    });

    await expect(loadAllOverview({ timeoutMs: 0 })).resolves.toMatchObject({

      readiness: {
        modelKey: "future/model-key",
        reason: "unknown-model",
        ready: false,
      },
    });
  });

  it("shares the caller AbortSignal and preserves the aborted ApiError classification", async () => {
    fetchMock.mockImplementation((_input, init) => abortableResponse(init?.signal));
    const caller = new AbortController();
    const pending = loadAllOverview({ signal: caller.signal, timeoutMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    caller.abort("fake-cookie-must-not-leak");
    const error = await pending.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "ABORTED", status: 0, data: undefined });
    expect(String(error)).not.toContain("fake-cookie-must-not-leak");
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
  });

  it("maps middleware 401 to a safe authentication error rather than offline", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ error: "fake-authorization-secret" }, 401)),
    );

    const error = await loadAllOverview({ timeoutMs: 0 }).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "HTTP_ERROR", data: undefined });
    expect(String(error)).not.toContain("fake-authorization-secret");
  });

  it("preserves network and timeout error kinds with safe text", async () => {
    const secretEndpoint = "https://fake-secret-endpoint.example/v1";
    fetchMock.mockRejectedValueOnce(new TypeError(secretEndpoint));
    const networkError = await loadAllOverview({ timeoutMs: 0 }).catch(
      (reason: unknown) => reason,
    );
    expect(networkError).toMatchObject({ code: "NETWORK_ERROR", data: undefined });
    expect(String(networkError)).not.toContain(secretEndpoint);

    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockImplementation((_input, init) => abortableResponse(init?.signal));
    const pending = loadAllOverview({ timeoutMs: 5 }).catch(
      (reason: unknown) => reason,
    );
    await vi.advanceTimersByTimeAsync(6);
    const timeoutError = await pending;
    expect(timeoutError).toMatchObject({ code: "TIMEOUT", data: undefined });
  });

  it("sanitizes contract failures", async () => {
    const secret = "fake-provider-payload-secret";
    fetchMock.mockImplementation((input) => {
      const path = String(input);
      if (path === "/api/session") return Promise.resolve(json({ authenticated: true }));
      if (path === "/api/chat/readiness") return Promise.resolve(json({ secret }));
      return Promise.resolve(json(readinessDto("ready", "model-a")));
    });

    const error = await loadAllOverview({ timeoutMs: 0 }).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(secret);
  });

  it("drops extra secret/config fields and only calls the two safe Runtime endpoints", async () => {
    const forbidden = [
      "fake-api-key",
      "Bearer fake-authorization",
      "https://fake-provider-endpoint.example/v1",
      "fake-session-cookie",
      "fake-provider-raw-payload",
    ];
    fetchMock.mockImplementation((input) => {
      const path = String(input);
      if (path === "/api/session") {
        return Promise.resolve(json({ authenticated: true, cookie: forbidden[3] }));
      }
      return Promise.resolve(json({
        ...readinessDto("ready", "model-a"),
        provider_payload: forbidden[4],
      }));
    });

    const overview = await loadAllOverview({ timeoutMs: 0 });
    const serialized = JSON.stringify(overview);

    forbidden.forEach((value) => expect(serialized).not.toContain(value));
    expect(paths()).toEqual([
      "/api/session",
      "/api/chat/readiness",
    ]);
    expect(paths().join(" ")).not.toMatch(
      /settings|conversations|messages|send|regenerate|provider|\/ws|websocket/,
    );
  });

  function paths() {
    return fetchMock.mock.calls.map(([input]) => String(input));
  }

  function mockSafeOverview({
    readiness = readinessDto("ready", "model-a"),
  }: {
    readiness?: Record<string, unknown>;
  } = {}) {
    fetchMock.mockImplementation((input) => {
      const path = String(input);
      if (path === "/api/session") return Promise.resolve(json({ authenticated: true }));
      return Promise.resolve(json(readiness));
    });
  }
});

function abortableResponse(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function readinessDto(
  reason: "ready" | "unknown_model" | "provider_not_configured" | "configuration_invalid",
  modelKey: string,
) {
  return {
    ready: reason === "ready",
    model_key: modelKey,
    reason_code: reason,
    setup_action_required: reason !== "ready",
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadAllOverview(options: import("@/lib/api").ApiRequestOptions) {
  const [session, readiness] = await Promise.all([
    loadSettingsOverview("session", options), loadSettingsOverview("readiness", options),
  ]);
  return { session, readiness };
}
