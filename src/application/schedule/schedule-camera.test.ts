import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { readScheduleCamera, cameraSettingsUrl } from "@/domain/schedule/schedule-camera";
import { createScheduleCamera } from "./schedule-camera";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("read-only camera contract for scheduled checks", () => {
  it.each([true, false])("reads camera_open=%s independently of continuous monitoring and quiet hours", async (camera_open) => {
    const fetch = vi.fn().mockResolvedValue(json({ camera_open, monitoring: !camera_open, is_quiet_hours: true })); vi.stubGlobal("fetch", fetch);
    expect(await readScheduleCamera()).toBe(camera_open);
    expect(String(fetch.mock.calls[0][0])).toContain("/api/cam/status");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "include" });
    expect(fetch).toHaveBeenCalledOnce(); expect(cameraSettingsUrl).toMatch(/\/camera$/);
  });
  it.each([null, {}, { monitoring: true }, { camera_open: "false" }, { camera_open: 1 }])("rejects unknown camera status rather than guessing from %j", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(value)));
    await expect(readScheduleCamera()).rejects.toThrow("摄像头状态格式异常");
  });
  it.each([401, 503])("propagates HTTP %i through the existing transport", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, status)));
    await expect(readScheduleCamera()).rejects.toMatchObject({ status });
  });
});

describe("dialog-scoped camera reads", () => {
  it("moves through unknown, running, stopped and unknown on failure without a stale green status", async () => {
    const read = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new ApiError("private diagnostic", 503)).mockResolvedValueOnce(true);
    const c = createScheduleCamera(read);
    expect(c.getState().running).toBeNull(); const first = c.refresh(); expect(c.getState().loading).toBe(true); await first;
    expect(c.getState()).toEqual({ running: true, loading: false, error: null });
    await c.refresh(); expect(c.getState().running).toBe(false);
    await c.refresh(); expect(c.getState().running).toBeNull(); expect(c.getState().error).toContain("服务暂不可用"); expect(c.getState().error).not.toContain("private");
    await c.refresh(); expect(c.getState()).toEqual({ running: true, loading: false, error: null }); c.dispose();
  });
  it("ignores replaced requests and aborts requests on dialog disposal", async () => {
    let resolve!: (value: boolean) => void;
    const read = vi.fn<typeof readScheduleCamera>().mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValueOnce(false);
    const c = createScheduleCamera(read), listener = vi.fn(); c.subscribe(listener);
    const first = c.refresh(); await c.refresh(); expect(read.mock.calls[0][0]?.signal?.aborted).toBe(true);
    resolve(true); await first; expect(c.getState().running).toBe(false);
    read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const late = c.refresh(); c.dispose(); const count = listener.mock.calls.length;
    expect(read.mock.calls[2][0]?.signal?.aborted).toBe(true); resolve(true); await late;
    expect(listener).toHaveBeenCalledTimes(count); await c.refresh(); expect(read).toHaveBeenCalledTimes(3);
  });
});
