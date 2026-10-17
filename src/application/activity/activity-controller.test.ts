import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as activity from "@/domain/activity";
import * as device from "@/domain/device-context";
import { parseActivityRecords } from "@/domain/activity/activity-mappers";
import { ApiError, type ApiRequestOptions } from "@/lib/api";
import { deviceGroupCurrent } from "./activity-presentation";
import { filterActivityTimeline, projectActivityTimeline, timelineEvents } from "./activity-timeline";
import { createActivityController, type ActivityController } from "./activity-controller";

const rows = (app = "微信", count = 1) => parseActivityRecords({ entries: Array.from({ length: count }, () => ({ timestamp: 1000, date: "2026-10-17", time: "00:16:40", device: "phone", app, title: "合成窗口" })) });
const group = { availability: "available" as const, observedAt: 1000, receivedAt: 1000, sampleSeq: 1, fresh: true, reason: "fresh", expiresAt: 1100 };
const status: device.DeviceStatus = { deviceId: "primary", evaluatedAt: 1000, battery: { ...group, level: 64, powerConnected: false, charging: false }, wifi: { ...group, expiresAt: 1200, connected: true, scene: "home" } };
const config: device.WifiConfig = { revision: 1, mappings: [{ ssid: "合成家庭", scene: "home" }, { ssid: "合成公司", scene: "work" }], cacheMaxAgeSeconds: 86400 };
function client() {
  return { ...activity, ...device,
    getActivityRecords: vi.fn(async (_query: activity.ActivityQuery, _options?: ApiRequestOptions) => rows()),
    getActivityDates: vi.fn(async () => ["2026-10-17"]), getActivityEnabled: vi.fn(async () => false), getActivitySummary: vi.fn(async () => [{ start: "10:00", end: "10:10", summary: "规则摘要", count: 1 }]),
    clearActivityLogs: vi.fn(async () => 2), getDeviceStatus: vi.fn(async (_options?: ApiRequestOptions) => status), getDeviceAiVisible: vi.fn(async () => true), setDeviceAiVisible: vi.fn(async (_visible: boolean, _options?: ApiRequestOptions) => {}),
    getWifiConfig: vi.fn(async () => config), saveWifiConfig: vi.fn(async (_previous: device.WifiConfig, mappings: readonly device.WifiMapping[], _options?: ApiRequestOptions) => ({ ...config, revision: 2, mappings })),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const active: ActivityController[] = [];
function setup(deps = client()) {
  const controller = createActivityController(deps, () => Date.now()); active.push(controller);
  return { controller, deps };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(500_000); });
afterEach(() => { active.forEach((controller) => controller.dispose()); active.length = 0; vi.useRealTimers(); });

describe("Activity reads, selection and snapshot reconciliation", () => {
  it("defaults to the real three-hour query and reads independent phone/config/permission resources", async () => {
    const { controller, deps } = setup(); await controller.start();
    expect(deps.getActivityRecords.mock.calls[0][0]).toEqual({ kind: "recent", hours: 3 });
    expect(controller.getState()).toMatchObject({ visibility: { data: true }, legacyEnabled: { data: false }, phone: { data: { status } }, wifi: { data: config } });
    expect(deps.clearActivityLogs).not.toHaveBeenCalled(); expect(deps.saveWifiConfig).not.toHaveBeenCalled(); expect(deps.setDeviceAiVisible).not.toHaveBeenCalled();
  });
  it("aborts the old selection and isolates late responses even if the transport ignores cancellation", async () => {
    const { controller, deps } = setup(); const old = deferred<readonly activity.ActivityRecord[]>();
    deps.getActivityRecords.mockImplementationOnce(() => old.promise);
    const first = controller.loadLogs(); await flush();
    const signal = deps.getActivityRecords.mock.calls[0][1]?.signal;
    await controller.selectQuery({ kind: "date", date: "2026-10-16" });
    expect(signal?.aborted).toBe(true);
    old.resolve(rows("旧响应")); await first;
    expect(controller.getState().logs.data?.[0].app).toBe("微信");
    expect(controller.getState().query).toEqual({ kind: "date", date: "2026-10-16" });
  });
  it("clears a previous range while a new date fails and recovery only reads", async () => {
    const { controller, deps } = setup(); await controller.loadLogs();
    deps.getActivityRecords.mockRejectedValueOnce(new Error("offline"));
    await controller.selectQuery({ kind: "date", date: "2026-10-16" });
    expect(controller.getState().logs).toMatchObject({ data: null, loading: false, error: expect.any(String) });
    await controller.loadLogs(); expect(controller.getState().logs.data).toHaveLength(1);
    expect(deps.clearActivityLogs).not.toHaveBeenCalled();
  });
  it("coalesces duplicate GETs, keeping same-range data on a read failure", async () => {
    const { controller, deps } = setup();
    await Promise.all([controller.loadLogs(), controller.loadLogs()]); expect(deps.getActivityRecords).toHaveBeenCalledTimes(1);
    deps.getActivityRecords.mockRejectedValueOnce(new Error("offline")); await controller.loadLogs();
    expect(controller.getState().logs.data).toHaveLength(1); expect(controller.getState().logs.error).not.toBeNull();
  });
  it("rechecks after a WS event arrives during initial GET and never appends the raw WS name", async () => {
    const { controller, deps } = setup(); const first = deferred<readonly activity.ActivityRecord[]>();
    deps.getActivityRecords.mockImplementationOnce(() => first.promise).mockResolvedValueOnce(rows("Chrome", 2));
    const reading = controller.loadLogs(); await flush(); controller.invalidateLogs(); controller.invalidateLogs();
    first.resolve(rows("旧快照")); await reading;
    await vi.advanceTimersByTimeAsync(600);
    expect(deps.getActivityRecords).toHaveBeenCalledTimes(2);
    expect(controller.getState().logs.data).toHaveLength(2);
    expect(controller.getState().logs.data?.every((row) => row.app === "Chrome")).toBe(true);
  });
  it("debounces bursts and replaces the complete list, preserving truly identical repeated samples", async () => {
    const { controller, deps } = setup();
    deps.getActivityRecords.mockResolvedValueOnce(rows("微信", 3)).mockResolvedValueOnce(rows("QQ", 2));
    await controller.loadLogs(); for (let i = 0; i < 100; i++) controller.invalidateLogs();
    await vi.advanceTimersByTimeAsync(600);
    expect(deps.getActivityRecords).toHaveBeenCalledTimes(2);
    expect(controller.getState().logs.data?.map((row) => row.app)).toEqual(["QQ", "QQ"]);
  });
  it("reprojects real GET/WS reconciliations and query/device selections without changing event counts", async () => {
    const { controller, deps } = setup();
    const samples = (count: number) => parseActivityRecords({ entries: Array.from({ length: count }, (_, index) => ({ timestamp: 1000+index*60, time: "server time", date: "2026-10-17", device: "phone", app: "QQ", title: "com.tencent.mobileqq" })) });
    deps.getActivityRecords.mockResolvedValueOnce(samples(2)).mockResolvedValueOnce(samples(3)).mockResolvedValueOnce(samples(1));
    await controller.loadLogs();
    const first = projectActivityTimeline(controller.getState().logs.data!)[0];
    expect(first.kind).toBe("repeat");
    controller.invalidateLogs(); await vi.advanceTimersByTimeAsync(600);
    const synced = projectActivityTimeline(controller.getState().logs.data!);
    expect(synced[0].key).toBe(first.key); expect(timelineEvents(synced[0])).toHaveLength(3);
    controller.selectDevice("pc"); expect(filterActivityTimeline(synced, controller.getState().device)).toHaveLength(0);
    expect(controller.getState().logs.data).toHaveLength(3);
    await controller.selectQuery({ kind: "date", date: "2026-10-16" });
    expect(projectActivityTimeline(controller.getState().logs.data!)[0].kind).toBe("event");
  });
  it("does not insert realtime activity into a selected historical archive", async () => {
    const { controller, deps } = setup(); await controller.selectQuery({ kind: "date", date: "2026-10-16" });
    controller.invalidateLogs(); await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.getActivityRecords).toHaveBeenCalledTimes(1);
    controller.selectDevice("phone"); expect(deps.getActivityRecords).toHaveBeenCalledTimes(1);
  });
  it("summary always reads its own 3-hour contract, independent of date and device selection", async () => {
    const { controller, deps } = setup(); await controller.selectQuery({ kind: "date", date: "2020-01-01" }); controller.selectDevice("pc");
    await controller.loadSummary(); expect(deps.getActivitySummary).toHaveBeenCalledTimes(1);
    expect(controller.getState().summary.data?.[0].summary).toBe("规则摘要");
  });
  it("unmount aborts active requests, cancels debounce/expiry and ignores late publications", async () => {
    const { controller, deps } = setup(); const late = deferred<readonly activity.ActivityRecord[]>(); deps.getActivityRecords.mockImplementationOnce(() => late.promise);
    const listener = vi.fn(); controller.subscribe(listener);
    const reading = controller.loadLogs(); await flush(); const signal = deps.getActivityRecords.mock.calls[0][1]?.signal;
    controller.invalidateLogs(); controller.dispose(); const publications = listener.mock.calls.length;
    late.resolve(rows()); await reading; await vi.advanceTimersByTimeAsync(200_000);
    expect(signal?.aborted).toBe(true); expect(listener).toHaveBeenCalledTimes(publications); expect(deps.getActivityRecords).toHaveBeenCalledTimes(1);
  });
});

describe("Phone deadlines and explicit mutations", () => {
  it("masks an expired battery independently while revalidation is still pending", async () => {
    const { controller, deps } = setup(); await controller.refreshPhone();
    const pending = deferred<device.DeviceStatus>(); deps.getDeviceStatus.mockImplementationOnce(() => pending.promise);
    await vi.advanceTimersByTimeAsync(100_000);
    const state = controller.getState(), snapshot = state.phone.data!;
    expect(deviceGroupCurrent(snapshot.status.battery, snapshot, state.clockNow)).toBe(false);
    expect(deviceGroupCurrent(snapshot.status.wifi, snapshot, state.clockNow)).toBe(true);
    expect(state.phone.loading).toBe(true);
    await vi.advanceTimersByTimeAsync(100_000);
    const later = controller.getState();
    expect(deviceGroupCurrent(later.phone.data!.status.wifi, later.phone.data!, later.clockNow)).toBe(false);
    pending.resolve({ ...status, battery: { ...status.battery, fresh: false, reason: "expired", expiresAt: null, level: null, charging: null, powerConnected: null } }); await flush();
  });
  it("a failed phone read clears current values instead of showing stale success", async () => {
    const { controller, deps } = setup(); await controller.refreshPhone();
    deps.getDeviceStatus.mockRejectedValueOnce(new Error("offline")); await controller.refreshPhone();
    expect(controller.getState().phone.data).toBeNull(); expect(controller.getState().phone.error).not.toBeNull();
  });
  it("updates only the phone AI visibility; old activity config stays untouched", async () => {
    const { controller, deps } = setup(); await controller.start(); await controller.setVisibility(false);
    expect(deps.setDeviceAiVisible).toHaveBeenCalledWith(false, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(deps.clearActivityLogs).not.toHaveBeenCalled(); expect(deps.saveWifiConfig).not.toHaveBeenCalled();
  });
  it("moves/removes one mapping while preserving all other entries and revision", async () => {
    const { controller, deps } = setup(); await controller.loadWifi(); expect(await controller.saveMapping("合成家庭", "work")).toBe(true);
    expect(deps.saveWifiConfig.mock.calls[0].slice(0, 2)).toEqual([config, [{ ssid: "合成公司", scene: "work" }, { ssid: "合成家庭", scene: "work" }]]);
    await controller.saveMapping("合成家庭", null);
    expect(deps.saveWifiConfig.mock.calls[1][1]).toEqual([{ ssid: "合成公司", scene: "work" }]);
  });
  it.each([409, 0])("reports failed/ambiguous Wi-Fi saves (%s), reloads and never automatically repeats PUT", async (code) => {
    const { controller, deps } = setup(); await controller.loadWifi();
    deps.saveWifiConfig.mockRejectedValueOnce(new ApiError("failed", code)); deps.getWifiConfig.mockResolvedValueOnce({ ...config, revision: 9 });
    expect(await controller.saveMapping("合成家庭", "work")).toBe(false);
    expect(deps.saveWifiConfig).toHaveBeenCalledTimes(1); expect(controller.getState().wifi.data?.revision).toBe(9);
    expect(controller.getState().notice).toMatchObject({ error: true, text: expect.stringContaining("不会自动重复提交") });
  });
  it("explicit clear reports deleted file count, reloads both logs/dates and never repeats POST on failed recovery", async () => {
    const { controller, deps } = setup(); await controller.start();
    deps.getActivityRecords.mockRejectedValueOnce(new Error("read failed")); await controller.clearAll();
    expect(deps.clearActivityLogs).toHaveBeenCalledTimes(1);
    expect(controller.getState().notice?.text).toBe("已清空全部活动日志，删除了 2 个日志文件。");
    await controller.loadLogs(); expect(deps.clearActivityLogs).toHaveBeenCalledTimes(1);
    expect(deps.getDeviceStatus).toHaveBeenCalledTimes(1);
  });
  it("an uncertain clear response triggers GET reconciliation without an automatic destructive retry", async () => {
    const { controller, deps } = setup(); deps.clearActivityLogs.mockRejectedValueOnce(new ApiError("timeout", 0));
    await controller.clearAll(); expect(deps.clearActivityLogs).toHaveBeenCalledTimes(1); expect(deps.getActivityRecords).toHaveBeenCalledTimes(1);
    expect(controller.getState().notice?.error).toBe(true);
  });
});
