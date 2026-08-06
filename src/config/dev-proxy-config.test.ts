import { describe, expect, it } from "vitest";

import {
  createDevProxyConfig,
  DEV_PROXY_TARGET_ENV,
  parseDevProxyTarget,
} from "@/config/dev-proxy-config";

describe("development proxy target validation", () => {
  it("leaves the development server unchanged without a target", () => {
    expect(parseDevProxyTarget(undefined)).toBeUndefined();
    expect(parseDevProxyTarget("   ")).toBeUndefined();
    expect(createDevProxyConfig(undefined)).toBeUndefined();
  });

  it("accepts HTTP and HTTPS origins", () => {
    expect(parseDevProxyTarget("http://127.0.0.1:18080")).toBe(
      "http://127.0.0.1:18080",
    );
    expect(parseDevProxyTarget("https://backend.example")).toBe(
      "https://backend.example",
    );
  });

  it("trims whitespace and removes an origin trailing slash", () => {
    expect(parseDevProxyTarget("  https://backend.example/  ")).toBe(
      "https://backend.example",
    );
  });

  it("rejects unsupported protocols without echoing the target", () => {
    expect(() => parseDevProxyTarget("ftp://secret.example")).toThrow(
      `${DEV_PROXY_TARGET_ENV} must use the http: or https: protocol`,
    );
  });

  it("rejects username or password credentials", () => {
    expect(() =>
      parseDevProxyTarget("https://user:password@backend.example"),
    ).toThrow(`${DEV_PROXY_TARGET_ENV} must not include username or password`);
  });

  it("rejects query parameters and fragments", () => {
    expect(() =>
      parseDevProxyTarget("https://backend.example?token=private"),
    ).toThrow(
      `${DEV_PROXY_TARGET_ENV} must not include query parameters or a fragment`,
    );
    expect(() =>
      parseDevProxyTarget("https://backend.example#private"),
    ).toThrow(
      `${DEV_PROXY_TARGET_ENV} must not include query parameters or a fragment`,
    );
  });

  it("rejects a target path so proxy routes remain unchanged", () => {
    expect(() =>
      parseDevProxyTarget("https://backend.example/base"),
    ).toThrow(
      `${DEV_PROXY_TARGET_ENV} must contain only an origin, without a path`,
    );
  });
});

describe("development proxy routes", () => {
  it("proxies API and confirmed upload paths without rewriting responses", () => {
    const proxy = createDevProxyConfig("https://backend.example");

    expect(proxy?.["/api"]).toEqual({
      target: "https://backend.example",
      changeOrigin: true,
      secure: true,
    });
    expect(proxy?.["/uploads"]).toEqual(proxy?.["/api"]);
  });

  it("enables WebSocket upgrade on the browser session endpoint", () => {
    expect(createDevProxyConfig("https://backend.example")?.["/ws"]).toEqual({
      target: "https://backend.example",
      changeOrigin: true,
      secure: true,
      ws: true,
    });
  });

  it("keeps the target outside Vite client environment exposure", () => {
    expect(DEV_PROXY_TARGET_ENV).toBe("PENUMBRA_DEV_PROXY_TARGET");
    expect(DEV_PROXY_TARGET_ENV).not.toMatch(/^VITE_/);
  });
});
