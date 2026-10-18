import { afterEach, describe, expect, it, vi } from "vitest";
import { configDto, locationConfig, locationStatus } from "@/domain/location/location-fixtures";
import { LocationBusinessError, parseLocationConfig, type LocationConfig, type LocationStatus, type LocationPatch } from "@/domain/location";
import { ApiError, type ApiRequestOptions } from "@/lib/api";
import { createLocationController } from "./location-controller";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const controllers: ReturnType<typeof createLocationController>[] = [];
function setup() {
  const api = {
    getLocationConfig: vi.fn(async (_options?: ApiRequestOptions) => locationConfig()), getLocationStatus: vi.fn(async (_options?: ApiRequestOptions) => locationStatus()),
    saveLocationConfig: vi.fn(async (_patch: LocationPatch, _options?: ApiRequestOptions) => {}), setLocationHome: vi.fn(async () => ({ coordinate: { lng: 117, lat: 40 }, address: "新家庭位置" })),
    clearLocationKey: vi.fn(async () => {}), revealLocationKey: vi.fn(async () => "fake-key-value"),
    searchLocationPois: vi.fn(async (category: string) => ({ category, resolvedQuery: category, fallbackUsed: false, items: [] })),
  };
  const controller = createLocationController(api); controllers.push(controller); return { controller, api };
}
afterEach(() => { controllers.forEach((controller) => controller.dispose()); controllers.length = 0; vi.useRealTimers(); });

describe("Location save and reconciliation", () => {
  it("sends only dirty fields and reloads server values after acknowledgement", async () => {
    const { controller, api } = setup(); await controller.refresh();
    controller.edit("quiet_hours_end", "09:30"); controller.edit("weekday_days", "");
    api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, quiet_hours_end: "09:30", weekday_days: "" }));
    await controller.save();
    expect(api.saveLocationConfig).toHaveBeenCalledWith({ quiet_hours_end: "09:30", weekday_days: "" }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(api.getLocationConfig).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ dirty: false, draft: { quiet_hours_end: "09:30", weekday_days: "" }, pending: null });
  });
  it("retains unsaved values and the new Key on failure, and never shows raw error details", async () => {
    const { controller, api } = setup(); await controller.refresh(); controller.edit("quiet_hours_end", "10:00"); controller.replaceKey("fake-new-key");
    api.saveLocationConfig.mockRejectedValueOnce(new ApiError("secret-private-error", 0, { token: "secret-private-error" }, "TIMEOUT"));
    await controller.save();
    expect(controller.getState()).toMatchObject({ dirty: true, replacementKey: "fake-new-key", draft: { quiet_hours_end: "10:00" } });
    expect(controller.getState().feedback?.text).not.toContain("secret-private-error");
    expect(api.getLocationConfig).toHaveBeenCalledTimes(1);
  });
  it("does not announce success or discard drafts when post-save verification fails", async () => {
    const { controller, api } = setup(); await controller.refresh(); controller.edit("quiet_hours_end", "10:00");
    api.getLocationConfig.mockRejectedValueOnce(new Error("offline")); await controller.save();
    expect(controller.getState()).toMatchObject({ dirty: true, draft: { quiet_hours_end: "10:00" }, feedback: { error: true }, pending: null });
    expect(controller.getState().feedback?.text).toContain("操作已提交");
    await controller.save(); expect(api.saveLocationConfig).toHaveBeenCalledTimes(1);
    api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, quiet_hours_end: "10:00" })); await controller.refresh();
    expect(controller.getState().dirty).toBe(false);
  });
  it("preserves edits during refresh and uses the new server baseline for untouched fields", async () => {
    const { controller, api } = setup(); await controller.refresh(); controller.edit("quiet_hours_end", "09:30");
    api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, home_threshold: 700 })); await controller.refreshDisplay();
    expect(controller.getState().draft).toMatchObject({ quiet_hours_end: "09:30", home_threshold: "700" });
    await controller.save(); expect(api.saveLocationConfig.mock.calls[0][0]).toEqual({ quiet_hours_end: "09:30" });
  });
  it("blocks saves until config is valid and rejects invalid time without a request", async () => {
    const { controller, api } = setup(); api.getLocationConfig.mockRejectedValueOnce(new Error("offline")); await controller.refresh();
    await controller.save(); expect(api.saveLocationConfig).not.toHaveBeenCalled();
    await controller.refresh(); controller.edit("quiet_hours_start", "25:00"); await controller.save();
    expect(controller.getState().validation.quiet_hours_start).toBeDefined(); expect(api.saveLocationConfig).not.toHaveBeenCalled();
  });
  it("cancels earlier reads and ignores late responses including ones after disposal", async () => {
    const { controller, api } = setup(), old = deferred<LocationStatus>(), config = deferred<LocationConfig>();
    api.getLocationStatus.mockImplementationOnce(() => old.promise);
    const first = controller.refresh(); await flush(); await controller.refresh();
    old.resolve({ ...locationStatus(), address: "obsolete" }); await first;
    expect(controller.getState().status?.address).toBe("合成位置");
    expect(api.getLocationStatus.mock.calls[0][0]?.signal?.aborted).toBe(true);
    api.getLocationConfig.mockImplementationOnce(() => config.promise);
    const last = controller.refresh(); await flush(); controller.dispose();
    config.resolve(parseLocationConfig({ ...configDto, weekday_days: "7" })); await last;
    expect(controller.getState().config?.values.weekday_days).not.toBe("7");
  });
  it("does not race a config mutation with polling and does not allow duplicate submissions", async () => {
    const { controller, api } = setup(), write = deferred<void>(); await controller.refresh(); controller.edit("enabled", false);
    api.saveLocationConfig.mockImplementationOnce(() => write.promise);
    const saving = controller.save(); await flush(); await controller.refresh(); await controller.save();
    expect(api.saveLocationConfig).toHaveBeenCalledTimes(1); expect(api.getLocationConfig).toHaveBeenCalledTimes(1);
    write.resolve(); await saving; expect(api.getLocationConfig).toHaveBeenCalledTimes(2);
  });
  it.each(["weekday", "weekend"] as const)("clears both %s overrides locally and submits empty strings without touching the unified period", async (kind) => {
    const { controller, api } = setup();
    const start = `quiet_hours_${kind}_start` as const, end = `quiet_hours_${kind}_end` as const;
    api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, [start]: "23:00", [end]: "09:30" }));
    await controller.refresh();
    const states: unknown[] = []; const unsubscribe = controller.subscribe((state) => states.push(state.draft)); states.length = 0;
    controller.clearPeriod(kind); unsubscribe();
    expect(states).toHaveLength(1);
    expect(api.saveLocationConfig).not.toHaveBeenCalled();
    expect(controller.getState().draft).toMatchObject({ [start]: "", [end]: "", quiet_hours_start: "00:00", quiet_hours_end: "08:00" });
    api.getLocationConfig.mockResolvedValueOnce(locationConfig()); await controller.save();
    expect(api.saveLocationConfig.mock.calls[0][0]).toEqual({ [start]: "", [end]: "" });
    expect(controller.getState().dirty).toBe(false);
  });
  it("saves Key, position parameters and settings separately while retaining every other draft until its own save", async () => {
    const { controller, api } = setup();
    let server = locationConfig();
    api.getLocationConfig.mockImplementation(async () => server);
    api.saveLocationConfig.mockImplementation(async (patch) => {
      const { amap_key, ...values } = patch;
      server = { ...server, values: { ...server.values, ...values },
        credential: amap_key ? { configured: true, masked: "••••next", secretRef: "next-ref" } : server.credential };
    });
    await controller.refresh();
    controller.edit("enabled", false); controller.edit("quiet_hours_end", "09:30"); controller.edit("weekday_days", "");
    controller.edit("home_threshold", "750"); controller.edit("poi_radius", "4000"); controller.replaceKey(" next-key ");
    await controller.saveKey();
    expect(api.saveLocationConfig.mock.calls[0][0]).toEqual({ amap_key: "next-key" });
    expect(controller.getState()).toMatchObject({ dirty: true, replacementKey: "", config: { credential: { secretRef: "next-ref" } },
      draft: { enabled: false, quiet_hours_end: "09:30", weekday_days: "", home_threshold: "750", poi_radius: "4000" } });
    controller.replaceKey("future-key");
    await controller.savePosition();
    expect(api.saveLocationConfig.mock.calls[1][0]).toEqual({ home_threshold: 750, poi_radius: 4000 });
    expect(controller.getState()).toMatchObject({ dirty: true, replacementKey: "future-key", homeAwaitingReport: locationStatus().updatedAt,
      draft: { enabled: false, quiet_hours_end: "09:30", weekday_days: "", home_threshold: "750" } });
    await controller.save();
    expect(api.saveLocationConfig.mock.calls[2][0]).toEqual({ enabled: false, quiet_hours_end: "09:30", weekday_days: "" });
    expect(controller.getState()).toMatchObject({ dirty: true, replacementKey: "future-key" });
    controller.replaceKey(""); expect(controller.getState().dirty).toBe(false);
    await controller.save(); await controller.savePosition(); await controller.saveKey();
    expect(api.saveLocationConfig).toHaveBeenCalledTimes(3); expect(api.getLocationConfig).toHaveBeenCalledTimes(4);
  });
  it("validates only the saved section and never resets other drafts on a blank Key save", async () => {
    const { controller, api } = setup(); await controller.refresh();
    controller.edit("quiet_hours_end", "25:00"); controller.edit("weekday_days", "invalid"); controller.edit("home_threshold", "49");
    controller.replaceKey(" "); await controller.saveKey();
    expect(api.saveLocationConfig).not.toHaveBeenCalled(); expect(controller.getState().draft?.home_threshold).toBe("49");
    controller.replaceKey("new-key"); await controller.saveKey();
    expect(api.saveLocationConfig.mock.calls[0][0]).toEqual({ amap_key: "new-key" });
    expect(controller.getState().draft).toMatchObject({ quiet_hours_end: "25:00", weekday_days: "invalid", home_threshold: "49" });
    controller.edit("home_threshold", "750"); await controller.savePosition();
    expect(api.saveLocationConfig.mock.calls[1][0]).toEqual({ home_threshold: 750 });
    expect(controller.getState().draft?.quiet_hours_end).toBe("25:00");
    controller.edit("quiet_hours_end", "09:30"); controller.edit("weekday_days", ""); controller.edit("home_threshold", "49");
    await controller.save();
    expect(api.saveLocationConfig.mock.calls[2][0]).toEqual({ quiet_hours_end: "09:30", weekday_days: "" });
    expect(controller.getState().draft?.home_threshold).toBe("49");
  });
  it.each(["save", "savePosition", "saveKey"] as const)("retains all inputs after %s fails and permits a scoped retry", async (action) => {
    const { controller, api } = setup(); await controller.refresh();
    controller.edit("quiet_hours_end", "09:30"); controller.edit("home_threshold", "750"); controller.replaceKey("new-key");
    const before = controller.getState();
    api.saveLocationConfig.mockRejectedValueOnce(new LocationBusinessError()); await controller[action]();
    expect(controller.getState()).toMatchObject({ draft: before.draft, baseline: before.baseline, replacementKey: "new-key", dirty: true, feedback: { error: true }, pending: null });
    expect(api.getLocationConfig).toHaveBeenCalledTimes(1);
    await controller[action]();
    expect(api.saveLocationConfig).toHaveBeenCalledTimes(2);
    const patch = action === "save" ? { quiet_hours_end: "09:30" } : action === "savePosition" ? { home_threshold: 750 } : { amap_key: "new-key" };
    expect(api.saveLocationConfig.mock.calls[0][0]).toEqual(patch); expect(api.saveLocationConfig.mock.calls[1][0]).toEqual(patch);
    expect(controller.getState().feedback?.error).toBe(false);
  });
  it("keeps the Key input when the acknowledgement cannot be verified through a safe config read", async () => {
    const { controller, api } = setup(); await controller.refresh(); controller.replaceKey("new-key"); controller.edit("weekday_days", "");
    api.getLocationConfig.mockRejectedValueOnce(new Error("offline")); await controller.saveKey();
    expect(controller.getState()).toMatchObject({ replacementKey: "new-key", dirty: true, draft: { weekday_days: "" }, feedback: { error: true, section: "key" } });
    await controller.saveKey(); expect(api.saveLocationConfig).toHaveBeenCalledTimes(1);
  });
  it("adopts canonical server values only for submitted fields and blocks cross-section duplicate saves", async () => {
    const { controller, api } = setup(), write = deferred<void>(); await controller.refresh();
    controller.edit("quiet_hours_end", "09:30"); controller.edit("home_threshold", "750"); controller.replaceKey("new-key");
    api.saveLocationConfig.mockImplementationOnce(() => write.promise);
    const saving = controller.save(); await flush();
    await controller.saveKey(); await controller.savePosition();
    expect(api.saveLocationConfig).toHaveBeenCalledTimes(1);
    api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, quiet_hours_end: "09:45", poi_radius: 4000 }));
    write.resolve(); await saving;
    expect(controller.getState()).toMatchObject({ dirty: true, replacementKey: "new-key", draft: { quiet_hours_end: "09:45", home_threshold: "750", poi_radius: "4000" } });
  });
});
describe("Location explicit operations", () => {
  it("sets home with the dedicated endpoint, preserves other drafts and awaits a new report before showing distance", async () => {
    const { controller, api } = setup(); await controller.refresh(); controller.edit("quiet_hours_end", "09:30"); controller.edit("home_lat", "41");
    api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, home_lng: 117, home_lat: 40 }));
    await controller.setHome();
    expect(api.setLocationHome).toHaveBeenCalledOnce(); expect(api.saveLocationConfig).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ homeAwaitingReport: locationStatus().updatedAt, draft: { home_lng: "117", home_lat: "40", quiet_hours_end: "09:30" } });
    api.getLocationStatus.mockResolvedValue({ ...locationStatus(), updatedAt: locationStatus().updatedAt! + 1 }); await controller.refresh();
    expect(controller.getState().homeAwaitingReport).not.toBeNull(); // A coordinate-only quiet heartbeat has the same timestamp behavior.
    await controller.refresh(true, locationStatus().updatedAt! + 1);
    expect(controller.getState().homeAwaitingReport).toBeNull();
  });
  it("does not set home without valid coordinates or fall back to browser geolocation after failure", async () => {
    const { controller, api } = setup(); api.getLocationStatus.mockResolvedValueOnce({ ...locationStatus(), coordinate: null }); await controller.refresh();
    await controller.setHome(); expect(api.setLocationHome).not.toHaveBeenCalled();
    await controller.refresh(); api.setLocationHome.mockRejectedValueOnce(new LocationBusinessError()); await controller.setHome();
    expect(controller.getState().feedback?.error).toBe(true); expect(api.setLocationHome).toHaveBeenCalledTimes(1); expect(api.saveLocationConfig).not.toHaveBeenCalled();
  });
  it("clears via a current secret reference, retaining unrelated draft and replacement input", async () => {
    const { controller, api } = setup(); await controller.refresh(); controller.edit("weekday_days", ""); controller.replaceKey("future-key");
    api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, credential: { configured: false, masked: "", secret_ref: null } }));
    await controller.clearKey();
    expect(api.clearLocationKey).toHaveBeenCalledWith("fake-ref", expect.any(Object)); expect(api.saveLocationConfig).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ replacementKey: "future-key", draft: { weekday_days: "" }, config: { credential: { configured: false } } });
  });
  it("hides revealed values on timeout and rejects late secret results after hide, ref changes or disposal", async () => {
    vi.useFakeTimers(); const { controller, api } = setup(); await controller.refresh();
    await controller.useKey(); expect(controller.getState().revealedKey).toBe("fake-key-value");
    await vi.advanceTimersByTimeAsync(15_000); expect(controller.getState().revealedKey).toBeNull();
    const reveal = deferred<string>(); api.revealLocationKey.mockImplementationOnce(() => reveal.promise);
    const pending = controller.useKey(); await flush(); controller.hideKey(); reveal.resolve("late-secret"); await pending;
    expect(controller.getState().revealedKey).toBeNull();
    await controller.useKey(); api.getLocationConfig.mockResolvedValueOnce(parseLocationConfig({ ...configDto, credential: { ...configDto.credential, secret_ref: "new-ref" } }));
    await controller.refresh(); expect(controller.getState().revealedKey).toBeNull();
    await controller.useKey(); controller.dispose(); expect(controller.getState().revealedKey).toBeNull();
  });
  it("copies only an explicit reveal result and never stores the copied plaintext in display state", async () => {
    const { controller } = setup(); await controller.refresh(); const copy = vi.fn(async () => {});
    await controller.useKey(copy); expect(copy).toHaveBeenCalledWith("fake-key-value"); expect(controller.getState().revealedKey).toBeNull();
  });
  it("queries only explicitly, keeps cached rows on failure, and accepts empty successful results", async () => {
    const { controller, api } = setup(); await controller.refresh(); expect(api.searchLocationPois).not.toHaveBeenCalled();
    api.searchLocationPois.mockRejectedValueOnce(new LocationBusinessError()); await controller.search("餐饮美食");
    expect(controller.getState().searchError).toBeTruthy(); expect(controller.getState().status?.address).toBe("合成位置");
    await controller.search("餐饮美食"); expect(controller.getState().searchResult?.items).toEqual([]); expect(controller.getState().searchError).toBeNull();
    expect(api.searchLocationPois).toHaveBeenCalledTimes(2);
  });
});
