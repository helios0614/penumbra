import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RuntimeContractError,
  getAvailableModels,
  getChatReadiness,
  getSessionStatus,
} from "@/domain/runtime";

describe("runtime read client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("maps authenticated sessions and uses the cookie transport and AbortSignal", async () => {
    fetchMock.mockResolvedValue(json({ authenticated: true }));
    const caller = new AbortController();

    await expect(getSessionStatus({ signal: caller.signal, timeoutMs: 0 })).resolves.toEqual({
      status: "authenticated",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({ credentials: "include", method: "GET", signal: expect.any(AbortSignal) }),
    );
  });

  it("maps only 401 to unauthenticated", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "login required" }, 401));
    await expect(getSessionStatus({ timeoutMs: 0 })).resolves.toEqual({ status: "unauthenticated" });

    fetchMock.mockResolvedValueOnce(json({ error: "failed" }, 500));
    await expect(getSessionStatus({ timeoutMs: 0 })).rejects.toMatchObject({ status: 500 });
  });

  it("keeps network failures as transport errors", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(getSessionStatus({ timeoutMs: 0 })).rejects.toMatchObject({
      name: "ApiError",
      code: "NETWORK_ERROR",
      status: 0,
    });
  });

  it("rejects invalid session payloads without including raw values", async () => {
    const secret = "fake-session-secret";
    fetchMock.mockResolvedValue(json({ authenticated: false, secret }));
    const error = await getSessionStatus({ timeoutMs: 0 }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RuntimeContractError);
    expect(String(error)).not.toContain(secret);
  });

  it("maps models in backend order, labels them by key, and drops extra fields", async () => {
    fetchMock.mockResolvedValue(json([
      { key: "second", provider: "p2", endpoint: "https://private", secret: "fake-secret" },
      { key: "first", provider: "p1", config_id: "hidden" },
    ]));
    await expect(getAvailableModels({ timeoutMs: 0 })).resolves.toEqual([
      { key: "second", label: "second", provider: "p2" },
      { key: "first", label: "first", provider: "p1" },
    ]);
  });

  it("accepts an empty model list and rejects invalid model payloads safely", async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    await expect(getAvailableModels({ timeoutMs: 0 })).resolves.toEqual([]);

    for (const payload of [{}, [{ provider: "p" }], [{ key: "k" }], [{ key: 1, provider: "p" }], [{ key: "k", provider: "" }]]) {
      fetchMock.mockResolvedValueOnce(json(payload));
      await expect(getAvailableModels({ timeoutMs: 0 })).rejects.toBeInstanceOf(RuntimeContractError);
    }
  });

  it("omits a missing model query and preserves an explicit empty model", async () => {
    fetchMock
      .mockResolvedValueOnce(json(readiness("ready")))
      .mockResolvedValueOnce(json(readiness("unknown_model", "")));
    await getChatReadiness(undefined, { timeoutMs: 0 });
    await getChatReadiness("", { timeoutMs: 0 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat/readiness");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/chat/readiness?conv_id=");
  });

  it("URL-encodes model keys and maps every readiness reason", async () => {
    const cases = [
      ["ready", "ready"],
      ["unknown_model", "unknown-model"],
      ["provider_not_configured", "provider-not-configured"],
      ["generation_not_supported", "configuration-invalid", true],
      ["configuration_invalid", "configuration-invalid"],
    ] as const;
    for (const [wire, domain, generationUnsupported] of cases) {
      fetchMock.mockResolvedValueOnce(json({ ...readiness(wire, "model/key + one"), extra: "drop-me" }));
      await expect(getChatReadiness("model/key + one", { timeoutMs: 0 })).resolves.toEqual({
        ready: wire === "ready",
        modelKey: "model/key + one",
        reason: domain,
        setupActionRequired: wire !== "ready",
        ...(generationUnsupported ? { generationUnsupported: true } : {}),
      });
    }
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat/readiness?conv_id=model%2Fkey+%2B+one");
  });

  it("returns ready=false as business state and rejects malformed readiness safely", async () => {
    fetchMock.mockResolvedValueOnce(json(readiness("provider_not_configured")));
    await expect(getChatReadiness(undefined, { timeoutMs: 0 })).resolves.toMatchObject({ ready: false });

    const secret = "fake-readiness-secret";
    for (const payload of [
      { ...readiness("ready"), reason_code: "not a safe code!", secret },
      { ready: true, model_key: "m", reason_code: "ready" },
      { ...readiness("ready"), ready: "yes" },
      { ...readiness("ready"), model_key: 1 },
      { ...readiness("ready"), setup_action_required: 0 },
    ]) {
      fetchMock.mockResolvedValueOnce(json(payload));
      const error = await getChatReadiness(undefined, { timeoutMs: 0 }).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(RuntimeContractError);
      expect(String(error)).not.toContain(secret);
    }
  });
});

function readiness(reason: "ready" | "unknown_model" | "provider_not_configured" | "generation_not_supported" | "configuration_invalid", modelKey = "model") {
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
