import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BACKEND_STATUS_ENDPOINT, checkBackendStatus } from "@/lib/backend";

describe("backend status probe", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("uses session as its only probe and maps 200 to authenticated", async () => {
    fetchMock.mockResolvedValue(json({ authenticated: true }));
    await expect(checkBackendStatus()).resolves.toMatchObject({ connection: "connected", login: "logged-in" });
    expect(BACKEND_STATUS_ENDPOINT).toBe("/api/session");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/session"]);
  });

  it("maps 401 to reachable but unauthenticated", async () => {
    fetchMock.mockResolvedValue(json({ error: "login required" }, 401));
    await expect(checkBackendStatus()).resolves.toMatchObject({ connection: "connected", login: "logged-out" });
  });

  it("maps network errors to unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(checkBackendStatus()).resolves.toMatchObject({ connection: "failed", login: "unknown" });
  });

  it("keeps 5xx reachable without treating it as unauthenticated", async () => {
    fetchMock.mockResolvedValue(json({ error: "service failed" }, 500));
    await expect(checkBackendStatus()).resolves.toMatchObject({ connection: "connected", login: "unknown" });
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}
