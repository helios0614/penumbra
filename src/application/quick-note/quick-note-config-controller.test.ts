import { describe, expect, it, vi } from "vitest";
import * as client from "@/domain/quick-note";
import { ApiError } from "@/lib/api";
import { createQuickNoteConfigController } from "./quick-note-config-controller";

const config: client.TriggerConfig = { hours: [5, 12, 20], labels: { "5": "夜晚", "12": "上午", "20": "下午" }, dayBoundaryHour: 5, timeZone: "Asia/Shanghai" };
const saved: client.TriggerConfig = { ...config, hours: [6, 13, 21], labels: { "6": "记录", "13": "记录", "21": "下午" }, dayBoundaryHour: 6 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const get = vi.fn().mockResolvedValue(config);
  const put = vi.fn().mockResolvedValue(undefined);
  const onRead = vi.fn();
  const controller = createQuickNoteConfigController(onRead, { ...client, getTriggerConfig: get, saveTriggerConfig: put });
  return { get, put, onRead, controller };
}
function edit(controller: ReturnType<typeof setup>["controller"]) {
  [6, 13, 21].forEach((hour, i) => controller.change(i, { hour: String(hour), ...(i < 2 ? { label: "记录" } : {}) }));
}

describe("Quick Note configuration editing", () => {
  it("loads fresh server config and keeps editing/cancellation local", async () => {
    const { controller, get, put } = setup();
    await controller.load();
    expect(get.mock.calls[0][0]).toMatchObject({ cache: "no-store" });
    expect(controller.getState().draft?.[1]).toEqual({ hour: "12", label: "上午" });
    edit(controller);
    expect(controller.getState().config).toEqual(config);
    controller.dispose();
    await controller.save();
    expect(put).not.toHaveBeenCalled();
  });
  it("does not substitute defaults after load failure and can retry", async () => {
    const { controller, get, put } = setup();
    get.mockRejectedValueOnce(new ApiError("offline", 0));
    await controller.load();
    expect(controller.getState()).toMatchObject({ config: null, draft: null, phase: "ready", error: expect.stringContaining("无法加载") });
    await controller.save(); expect(put).not.toHaveBeenCalled();
    await controller.load(); expect(controller.getState().draft).toHaveLength(3);
  });
  it("remaps cutoff names, blocks repeated submissions and adopts readback rather than the submitted draft", async () => {
    const { controller, get, put, onRead } = setup();
    await controller.load(); edit(controller);
    const pending = deferred<void>(); put.mockReturnValueOnce(pending.promise);
    const readback = deferred<client.TriggerConfig>(); get.mockReturnValueOnce(readback.promise);
    const saving = controller.save();
    await controller.save(); controller.change(0, { label: "忽略" });
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0][0]).toEqual({ hours: saved.hours, labels: saved.labels });
    expect(controller.getState().phase).toBe("saving");
    pending.resolve(); await Promise.resolve();
    expect(controller.getState().phase).toBe("verifying");
    await controller.save(); expect(put).toHaveBeenCalledOnce();
    const actual = { ...saved, labels: { ...saved.labels, "21": "服务端最终名称" } };
    readback.resolve(actual); await saving;
    expect(controller.getState()).toMatchObject({ config: actual, saved: true, phase: "ready", needsReadback: false });
    expect(controller.getState().draft?.[2].label).toBe("服务端最终名称");
    expect(onRead).toHaveBeenLastCalledWith(actual);
  });
  it.each(["24", "1.5", "", "12", "21"])("rejects invalid, duplicate or crossing first hour %s without a PUT", async (hour) => {
    const { controller, put } = setup(); await controller.load();
    controller.change(0, { hour }); await controller.save();
    expect(put).not.toHaveBeenCalled(); expect(controller.getState().error).toBeTruthy();
    expect(controller.getState().draft?.[0].hour).toBe(hour);
  });
  it("keeps a rejected draft editable with a comprehensible validation error", async () => {
    const { controller, put } = setup(); await controller.load(); edit(controller);
    put.mockRejectedValueOnce(new ApiError("invalid", 400)); await controller.save();
    expect(controller.getState()).toMatchObject({ needsReadback: false, phase: "ready", error: expect.stringContaining("服务端校验") });
    expect(controller.getState().draft?.[0].hour).toBe("6");
    controller.change(0, { label: "新名称" }); expect(controller.getState().error).toBeNull();
  });
  it("keeps the draft after successful PUT/readback failure and retries GET without another PUT", async () => {
    const { controller, get, put, onRead } = setup(); await controller.load(); edit(controller);
    get.mockRejectedValueOnce(new ApiError("offline", 0)); await controller.save();
    expect(controller.getState()).toMatchObject({ needsReadback: true, saved: false, error: expect.stringContaining("重新读取失败") });
    expect(controller.getState().draft?.[0].hour).toBe("6");
    await controller.save(); expect(put).toHaveBeenCalledOnce();
    get.mockResolvedValueOnce(saved); await controller.verify();
    expect(controller.getState()).toMatchObject({ saved: true, needsReadback: false, config: saved });
    expect(onRead).toHaveBeenLastCalledWith(saved); expect(put).toHaveBeenCalledOnce();
  });
  it("requires read-only recovery after an uncertain write, retaining a differing draft", async () => {
    const { controller, get, put } = setup(); await controller.load(); edit(controller);
    put.mockRejectedValueOnce(new ApiError("timeout", 0, null, "TIMEOUT")); await controller.save();
    expect(controller.getState().needsReadback).toBe(true);
    get.mockRejectedValueOnce(new ApiError("offline", 0)); await controller.verify();
    expect(controller.getState().needsReadback).toBe(true);
    await controller.verify();
    expect(controller.getState()).toMatchObject({ config, needsReadback: false, saved: false, error: expect.stringContaining("尚未确认草稿") });
    expect(controller.getState().draft?.[0].hour).toBe("6"); expect(put).toHaveBeenCalledOnce();
  });
  it("cancels requests and ignores late reads after unmount", async () => {
    const { controller, get, onRead } = setup(); const pending = deferred<client.TriggerConfig>();
    get.mockReturnValueOnce(pending.promise); const listener = vi.fn(); controller.subscribe(listener);
    const reading = controller.load(); const signal = get.mock.calls[0][0].signal;
    controller.dispose(); listener.mockClear(); pending.resolve(config); await reading;
    expect(signal.aborted).toBe(true); expect(onRead).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled();
  });
});
