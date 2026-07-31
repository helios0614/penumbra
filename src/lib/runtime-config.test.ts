import { describe, expect, it } from "vitest";

import {
  createRuntimeConfig,
  normalizeBaseUrl,
  resolveHttpUrl,
  resolveWebSocketUrl,
} from "@/lib/runtime-config";

describe("runtime config URL resolution", () => {
  it("normalizes base URLs and joins every slash combination", () => {
    expect(normalizeBaseUrl("  https://api.example.com/root///  ")).toBe(
      "https://api.example.com/root",
    );
    expect(resolveHttpUrl("https://api.example.com/root/", "/session")).toBe(
      "https://api.example.com/root/session",
    );
    expect(resolveHttpUrl("/gateway/", "api/session")).toBe(
      "/gateway/api/session",
    );
    expect(resolveHttpUrl("", "api/session")).toBe("/api/session");
  });

  it("keeps absolute HTTP URLs independent of the configured base", () => {
    expect(
      resolveHttpUrl(
        "https://api.example.com",
        "https://uploads.example.com/files",
      ),
    ).toBe("https://uploads.example.com/files");
  });

  it("converts HTTP protocols and same-origin paths to WebSocket URLs", () => {
    expect(resolveWebSocketUrl("http://api.example.com/ws")).toBe(
      "ws://api.example.com/ws",
    );
    expect(resolveWebSocketUrl("https://api.example.com/ws")).toBe(
      "wss://api.example.com/ws",
    );
    expect(resolveWebSocketUrl("wss://events.example.com/socket")).toBe(
      "wss://events.example.com/socket",
    );
    expect(
      resolveWebSocketUrl("/ws", "", "https://app.example.com"),
    ).toBe("wss://app.example.com/ws");
  });

  it("resolves relative upload and WebSocket paths from the API base", () => {
    const config = createRuntimeConfig(
      {
        VITE_API_BASE_URL: " https://api.example.com/root/ ",
        VITE_UPLOAD_URL: "/files/",
        VITE_WS_URL: "/socket",
        VITE_API_TIMEOUT_MS: "4500",
      },
      "https://app.example.com",
    );

    expect(config).toEqual({
      apiBaseUrl: "https://api.example.com/root",
      uploadUrl: "https://api.example.com/root/files/",
      websocketUrl: "wss://api.example.com/root/socket",
      requestTimeoutMs: 4500,
    });
  });

  it("keeps legacy API base support and safe relative defaults", () => {
    const config = createRuntimeConfig(
      { VITE_API_BASE: "/backend/" },
      "http://app.example.com",
    );

    expect(config.apiBaseUrl).toBe("/backend");
    expect(config.uploadUrl).toBe("/backend/api/upload");
    expect(config.websocketUrl).toBe("ws://app.example.com/backend/ws");
    expect(config.requestTimeoutMs).toBe(30_000);
  });
});
