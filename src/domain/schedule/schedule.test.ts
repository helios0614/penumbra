import { afterEach, describe, expect, it, vi } from "vitest";
import { createSchedule, listSchedules, listTodos, mutateSchedule } from "./schedule-client";
import { parseScheduleList } from "./schedule-mappers";
import { composeScheduleTime, scheduleTime, validDate, validMinute } from "./schedule-time";
import { ApiError } from "@/lib/api";

const row = { id: "sch_1", type: "alarm", status: "active", content: "提醒", trigger_at: "2026-10-19 22:00", created_at: 100 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("schedule DTO and legacy tolerance", () => {
  it("keeps unknown kinds/statuses and malformed local time from crashing the whole list", () => {
    const result = parseScheduleList([row, null, { ...row, id: "unknown", type: ["todo"], status: "broken" }, { ...row, id: "bad-time", trigger_at: "not a date" }]);
    expect(result.items).toHaveLength(3); expect(result.unsupported).toBe(2);
    expect(result.items[1]).toMatchObject({ kind: "unknown", status: "unknown" });
    expect(scheduleTime(result.items[2].triggerAt)).toBe("时间格式异常：not a date");
  });
  it("removes every row with an ambiguous ID and rejects a malformed list container", () => {
    expect(parseScheduleList([row, row])).toEqual({ items: [], unsupported: 2 });
    expect(() => parseScheduleList({ items: [] })).toThrow();
  });
  it("does not infer authors or due dates", () => {
    const result = parseScheduleList([{ ...row, type: "todo", content: "待确认 [?]", author: "AI", source: "model" }]).items[0];
    expect(result.content).toBe("待确认 [?]"); expect(result).not.toHaveProperty("author"); expect(result).not.toHaveProperty("dueAt");
  });
});

describe("server-local minute text", () => {
  it("validates calendar dates without browser-local or ISO conversion", () => {
    expect(validDate("2028-02-29")).toBe(true); expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("0001-01-01")).toBe(true); expect(validDate("0000-01-01")).toBe(false);
    expect(composeScheduleTime("2026-10-19", "22:00", true)).toBe("2026-10-19 22:00");
    expect(composeScheduleTime("2026-10-19", "", false)).toBe("2026-10-19");
    expect(composeScheduleTime("", "", false)).toBeUndefined();
  });
  it.each(["2026-10-19", "2026-10-19T24:00", "2026-02-30T22:00", "2026-10-19T22:00:00", "2026-10-19T22:00Z", "2026-10-19T22:00+08:00", ""])("rejects invalid or ambiguous alarm input %s", (text) => expect(validMinute(text)).toBe(false));
});

describe("legacy API mapping", () => {
  it.each([undefined, "", "2026-10-19", "2026-02-30 09:00", "2026-10-19 24:00", "2026-10-19 09:00Z", "2026-10-19 09:00:00"])("rejects invalid monitor minutes before POST: %s", async (triggerAt) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(createSchedule({ kind: "monitor", content: "查看一下", triggerAt })).rejects.toThrow("精确到分钟");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps monitor DTO separate from alarms and refuses a mismatched creation response", async () => {
    const list = parseScheduleList([{ ...row, type: "monitor" }]);
    expect(list).toMatchObject({ unsupported: 0, items: [{ kind: "monitor", status: "active" }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(row)));
    await expect(createSchedule({ kind: "monitor", content: "提醒", triggerAt: row.trigger_at })).rejects.toThrow("创建响应无法核对");
  });
  it("reads full and TODO snapshots with the existing API client", async () => {
    const fetch = vi.fn().mockResolvedValue(json([row])); vi.stubGlobal("fetch", fetch);
    await listSchedules(); fetch.mockResolvedValueOnce(json([])); await listTodos();
    expect(String(fetch.mock.calls[0][0])).toContain("/api/schedules");
    expect(String(fetch.mock.calls[1][0])).toContain("/api/schedules/todo");
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });
  it.each(["reminder", "todo", "alarm", "monitor"] as const)("creates %s with the real backend names", async (kind) => {
    const fetch = vi.fn().mockResolvedValue(json({ ...row, type: kind })); vi.stubGlobal("fetch", fetch);
    await createSchedule({ kind, content: " 提醒 ", ...((kind === "alarm" || kind === "monitor") ? { triggerAt: "2026-10-19T22:00" } : {}) });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ type: kind, content: "提醒", ...((kind === "alarm" || kind === "monitor") ? { trigger_at: "2026-10-19 22:00" } : {}) });
  });
  it.each([["cancel", "DELETE", "/sch%2F1"], ["done", "PATCH", "/sch%2F1/done"], ["restore", "PATCH", "/sch%2F1/restore"]] as const)("maps %s without any permanent delete or edit API", async (action, method, suffix) => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true })); vi.stubGlobal("fetch", fetch);
    await mutateSchedule("sch/1", action); expect(String(fetch.mock.calls[0][0])).toContain(`/api/schedules${suffix}`);
    expect(fetch.mock.calls[0][1].method).toBe(method);
  });
  it("never automatically retries a timed-out POST", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason))));
    vi.stubGlobal("fetch", fetch);
    const pending = createSchedule({ kind: "todo", content: "待办" }, { timeoutMs: 10 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(11);
    expect(await pending).toMatchObject({ code: "TIMEOUT" }); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 503, 422])("propagates HTTP %i rather than returning a false success", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: { code: "invalid_trigger_at" } }, status)));
    await expect(createSchedule({ kind: "alarm", content: "提醒", triggerAt: row.trigger_at })).rejects.toMatchObject({ status });
  });
  it("rejects a successful-looking malformed create response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ok: true })));
    await expect(createSchedule({ kind: "todo", content: "待办" })).rejects.toThrow("创建响应无法核对");
  });
  it("reports network failure through the shared transport", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(listSchedules()).rejects.toBeInstanceOf(ApiError);
  });
});
