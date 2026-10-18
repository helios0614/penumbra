import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocationKey, getLocationConfig, getLocationStatus, revealLocationKey, saveLocationConfig, searchLocationPois, setLocationHome } from "./location-client";
import { LocationBusinessError, LocationContractError } from "./location-types";
import { coordinate, parseLocationConfig, parseLocationStatus, parsePois, parseWeekdays, serializeWeekdays } from "./location-mappers";
import { configDto, statusDto } from "./location-fixtures";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());
describe("Location contracts", () => {
  it("projects only permitted config and credential metadata without retaining raw keys", () => {
    const result = parseLocationConfig({ ...configDto, amap_key: "do-not-retain", heartbeat_home_min: 10, movement_threshold: 300 });
    expect(result.credential).toEqual({ configured: true, masked: "••••1234", secretRef: "fake-ref" });
    expect(JSON.stringify(result)).not.toMatch(/do-not-retain|heartbeat|movement_threshold/);
    expect(result.categories).toEqual(["餐饮美食", "风景名胜"]);
    expect(parseLocationConfig({ ...configDto, weekday_days: "" }).values.weekday_days).toBe("");
    expect(parseLocationConfig({ ...configDto, credential: { configured: false, masked: "", secret_ref: null } }).credential.configured).toBe(false);
  });
  it("keeps manual weekdays canonical, supports no days or any combination, and rejects invalid day numbers", () => {
    expect(serializeWeekdays([7, 2, 7, 1])).toBe("1,2,7");
    expect(parseWeekdays(" 7,2, 2 ")).toEqual([2, 7]);
    expect(serializeWeekdays([])).toBe(""); expect(parseWeekdays("")).toEqual([]);
    expect(() => parseWeekdays("0,8")).toThrow(LocationContractError);
    expect(() => parseWeekdays("Monday")).toThrow(LocationContractError);
  });
  it("preserves unknown/no-coordinate and zero distance without inferring phone health", () => {
    expect(parseLocationStatus(statusDto).distanceFromHome).toBe(0);
    expect(parseLocationStatus({ ...statusDto, enabled: false, lng: 0, lat: 0, state: "unknown", updated_at: 0, weather: {} })).toMatchObject({ enabled: false, coordinate: null, state: "unknown", updatedAt: null, weather: null });
    expect(parseLocationStatus({ ...statusDto, distance_from_home: -1 }).distanceFromHome).toBeNull();
    expect(coordinate(Infinity, 20)).toBeNull(); expect(coordinate(200, 20)).toBeNull();
  });
  it("normalizes missing POI fields and upstream empty values without invented data or image placeholders", () => {
    const pois = parsePois({ "餐饮美食": [{ name: "地点", type: [], tel: "[]", rating: "[]", address: [], distance: "0", photos: [] }, {}] });
    expect(pois["餐饮美食"][0]).toEqual({ name: "地点", category: null, address: null, distance: 0, phone: null, rating: null, cost: null, photo: null });
    expect(pois["餐饮美食"][1].name).toBe("未命名地点");
    expect(parsePois({ x: [{ photos: ["javascript:alert(1)"] }] }).x[0].photo).toBeNull();
    expect(parsePois({ x: [] }).x).toEqual([]);
    expect(() => parsePois({ x: null })).toThrow(LocationContractError);
  });
  it.each([{ ...configDto, active: "yes" }, { ...configDto, credential: { configured: true, masked: "x", secret_ref: null } }, { ...configDto, quiet_hours_weekday_start: null }])("rejects malformed config instead of substituting defaults", (input) => expect(() => parseLocationConfig(input)).toThrow(LocationContractError));
  it("uses only authorized endpoints and passes credentials through the existing transport", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(configDto)).mockResolvedValueOnce(json(statusDto))
      .mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ secret: "fake-revealed-value" }))
      .mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ ok: true, home_lng: 116.4, home_lat: 39.9, address: "合成位置" }))
      .mockResolvedValueOnce(json({ ok: true, category: "餐饮美食", resolved_query: "餐饮美食", fallback_used: false, pois: [], count: 0, radius: 3000 }));
    vi.stubGlobal("fetch", fetch);
    await getLocationConfig(); await getLocationStatus(); await saveLocationConfig({ weekday_days: "" });
    expect(await revealLocationKey("fake-ref")).toBe("fake-revealed-value");
    await clearLocationKey("fake-ref"); await setLocationHome(); expect((await searchLocationPois("餐饮美食")).items).toEqual([]);
    const paths = fetch.mock.calls.map(([url]) => String(url));
    expect(paths).toEqual(["/api/location/config", "/api/location/status", "/api/location/config", "/api/location/secrets/reveal", "/api/location/secrets/clear", "/api/location/set-home", "/api/location/poi-search"]);
    expect(paths.join(" ")).not.toMatch(/heartbeat|test-sentinel/);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ weekday_days: "" });
    expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({ secret_ref: "fake-ref" });
    expect(fetch.mock.calls.every(([, options]) => options.credentials === "include")).toBe(true);
  });
  it("handles HTTP 200 business failure and rejects fake acknowledgements", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ ok: false, error: "private-server-detail" })).mockResolvedValueOnce(json({})));
    await expect(searchLocationPois("餐饮美食")).rejects.toThrow(LocationBusinessError);
    await expect(saveLocationConfig({ enabled: true })).rejects.toThrow(LocationContractError);
  });
  it("does not turn query delimiters into implicit radius overrides", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(searchLocationPois("咖啡|5000")).rejects.toThrow(LocationContractError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
