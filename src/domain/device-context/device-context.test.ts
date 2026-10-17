import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeviceAiVisible, getDeviceStatus, getWifiConfig, saveWifiConfig, setDeviceAiVisible } from "./device-context-client";
import { parseDeviceAiVisible, parseDeviceStatus, parseWifiConfig, validateWifiMappings } from "./device-context-mappers";
import { deviceGroupCurrent } from "@/application/activity/activity-presentation";

const group = { availability: "available", observed_at: 900, received_at: 910, sample_seq: 10, fresh: true, reason: "fresh", expires_at: 7200 };
const dto = { device_id: "primary", evaluated_at: 1000,
  battery: { ...group, level: 64, power_connected: true, charging: false },
  wifi: { ...group, observed_at: 950, received_at: 960, sample_seq: 22, connected: true, scene: "home", expires_at: 7300 } };
const config = { revision: 4, mappings: [{ ssid: "合成家庭网络", scene: "home" }], cache_max_age_seconds: 86400, server_instance_id: "do-not-keep" };
const json = (input: unknown) => new Response(JSON.stringify(input), { headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("DC1–DC3 phone state projection", () => {
  it("keeps battery and Wi-Fi sampling times/sequence/deadline independent", () => {
    const value = parseDeviceStatus(dto);
    expect(value.battery).toMatchObject({ observedAt: 900, receivedAt: 910, sampleSeq: 10, expiresAt: 7200, level: 64, charging: false, powerConnected: true });
    expect(value.wifi).toMatchObject({ observedAt: 950, receivedAt: 960, sampleSeq: 22, expiresAt: 7300, scene: "home" });
    expect(JSON.stringify(value)).not.toMatch(/ssid|bssid|binding_id|server_instance_id/);
  });
  it("uses each backend deadline with elapsed read time, independent of browser epoch/timezone", () => {
    const status = parseDeviceStatus(dto), snapshot = { status, startedAt: 500 };
    const now = 500 + (7200 - 1000) * 1000;
    expect(deviceGroupCurrent(status.battery, snapshot, now)).toBe(false);
    expect(deviceGroupCurrent(status.wifi, snapshot, now)).toBe(true);
    expect(deviceGroupCurrent(status.wifi, snapshot, now + 100_000)).toBe(false);
  });
  it("erases stale current values, preserving the last observed timestamp for explanation", () => {
    const status = parseDeviceStatus({ ...dto, wifi: { ...dto.wifi, fresh: false, reason: "expired", expires_at: null } });
    expect(status.wifi).toMatchObject({ fresh: false, reason: "expired", connected: null, scene: "unknown", observedAt: 950 });
  });
  it.each(["unknown", "permission_denied", "unavailable"])("handles unavailable sampling separately: %s", (availability) => {
    const status = parseDeviceStatus({ ...dto, battery: { ...dto.battery, availability, fresh: false, reason: "unavailable", level: null, charging: null, power_connected: null, expires_at: null } });
    expect(status.battery.level).toBeNull();
    expect(status.wifi.scene).toBe("home");
  });
  it.each([
    { ...dto, evaluated_at: "now" }, { ...dto, battery: { ...dto.battery, level: 101 } },
    { ...dto, wifi: { ...dto.wifi, connected: false, scene: "home" } },
    { ...dto, wifi: { ...dto.wifi, fresh: true, expires_at: null } },
  ])("rejects inconsistent DTOs instead of claiming a valid current observation", (input) => expect(() => parseDeviceStatus(input)).toThrow());
  it("reads the documented visibility default, never aliases old activity tracking", () => {
    expect(parseDeviceAiVisible({})).toBe(true);
    expect(parseDeviceAiVisible({ device_context_ai_visible: false, activity_tracking_enabled: true })).toBe(false);
    expect(() => parseDeviceAiVisible({ device_context_ai_visible: 1 })).toThrow();
  });
});

describe("Wi-Fi scene configuration", () => {
  it("maps only server config, without reproducing client cache/SSID recognition rules", () => {
    expect(parseWifiConfig(config)).toEqual({ revision: 4, mappings: config.mappings, cacheMaxAgeSeconds: 86400 });
  });
  it.each(["", "a".repeat(33), "\u0000network", "😀".repeat(9)])("validates configured SSID bytes and Unicode controls: %j", (ssid) => {
    expect(() => validateWifiMappings([{ ssid, scene: "home" }])).toThrow();
  });
  it("does not trim or case-fold SSIDs and rejects duplicates/oversized lists", () => {
    expect(() => validateWifiMappings([{ ssid: " Family ", scene: "home" }, { ssid: "family", scene: "work" }])).not.toThrow();
    expect(() => validateWifiMappings([{ ssid: "A", scene: "home" }, { ssid: "A", scene: "work" }])).toThrow();
    expect(() => validateWifiMappings(Array.from({ length: 129 }, (_, n) => ({ ssid: String(n), scene: "home" })))).toThrow();
  });
  it("reads snapshots/settings/config and only updates the one authorized settings field", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(dto)).mockResolvedValueOnce(json({ device_context_ai_visible: false, unrelated: "discard" })).mockResolvedValueOnce(json(config)).mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ ...config, revision: 5 }));
    vi.stubGlobal("fetch", fetch);
    await getDeviceStatus(); expect(await getDeviceAiVisible()).toBe(false);
    const saved = await getWifiConfig();
    await setDeviceAiVisible(true); await saveWifiConfig(saved, saved.mappings);
    expect(fetch.mock.calls[3][1].method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ device_context_ai_visible: true });
    expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({ revision: 4, mappings: config.mappings });
    expect(fetch.mock.calls.map(([url]) => String(url)).join()).not.toContain("/report");
  });
});
