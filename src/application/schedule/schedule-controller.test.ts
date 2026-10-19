import { describe, expect, it, vi } from "vitest";
import { createScheduleController, scheduleFailure } from "./schedule-controller";
import { ApiError } from "@/lib/api";
import type { ApiRequestOptions } from "@/lib/api";
import type { ManagedScheduleKind, Schedule, ScheduleInput } from "@/domain/schedule";

const row = (kind: Schedule["kind"] = "todo", status: Schedule["status"] = "active"): Schedule => ({ id: "sch_1", kind, status, content: "需要处理 [?]", triggerAt: "2020-01-01 09:00", createdAt: 100 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(kind: ManagedScheduleKind = "todo") {
  let rows: Schedule[] = [row(kind)];
  const api = {
    listSchedules: vi.fn(async (_options?: ApiRequestOptions) => ({ items: [...rows], unsupported: 0 })),
    listTodos: vi.fn(async (_options?: ApiRequestOptions) => ({ items: rows.filter((item) => item.kind === "todo" && ["active", "done"].includes(item.status)), unsupported: 0 })),
    createSchedule: vi.fn(async (input: ScheduleInput, _options?: ApiRequestOptions): Promise<Schedule> => {
      const item = { ...row(input.kind), id: "sch_new", content: input.content, triggerAt: input.triggerAt ?? "" }; rows = [...rows, item]; return item;
    }),
    mutateSchedule: vi.fn(async (id: string, action: "done" | "restore" | "cancel", _options?: ApiRequestOptions) => {
      rows = rows.map((item) => item.id === id ? { ...item, status: action === "done" ? "done" : action === "restore" ? "active" : "cancelled" } : item);
    }),
    getTriggerConfig: vi.fn(async (_options?: ApiRequestOptions) => ({ hours: [5, 12, 20], labels: { "5": "夜晚", "12": "上午", "20": "下午" }, dayBoundaryHour: 5, timeZone: "Europe/Paris" })),
  };
  const controller = createScheduleController(kind, api);
  return { controller, api, setRows(value: Schedule[]) { rows = value; } };
}

describe("schedule page read and mutation ownership", () => {
  it.each(["reminder", "todo", "alarm"] as const)("reads, creates and soft-cancels %s with a verified snapshot", async (kind) => {
    const { controller: c, api } = setup(kind); await c.refresh();
    if (kind === "alarm") await c.loadZone();
    expect(await c.create("新内容", kind === "alarm" ? "2026-10-19 22:00" : undefined)).toBe(true);
    await flush(); expect(c.getState().feedback?.error).toBe(false);
    expect(await c.act("sch_1", "cancel")).toBe(true);
    expect(c.getState().items.find((item) => item.id === "sch_1")?.status).toBe("cancelled");
    expect(api.mutateSchedule).toHaveBeenCalledWith("sch_1", "cancel", expect.anything());
    expect(c.getState().feedback?.text).toBe("已取消"); c.dispose();
  });
  it("completes and restores TODO without turning its time into a deadline", async () => {
    const { controller: c, api } = setup(); await c.refresh();
    expect(await c.act("sch_1", "done")).toBe(true); expect(c.getState().items[0].status).toBe("done");
    expect(await c.act("sch_1", "restore")).toBe(true); expect(c.getState().items[0].status).toBe("active");
    expect(c.getState().items[0].triggerAt).toBe("2020-01-01 09:00"); expect(api.listTodos).toHaveBeenCalled(); c.dispose();
  });
  it("does not trust ok for an ID that disappeared, and keeps failure after an ordinary successful read", async () => {
    const { controller: c, setRows } = setup(); await c.refresh(); setRows([]);
    expect(await c.act("sch_1", "done")).toBe(false);
    expect(c.getState().issue?.text).toContain("未找到原记录"); expect(c.getState().feedback).toBeNull();
    await c.refresh(); expect(c.getState().issue).not.toBeNull(); c.dispose();
  });
  it("uses the full list to verify cancellation because the TODO endpoint hides cancelled rows", async () => {
    const { controller: c, api } = setup(); await c.refresh(); await c.act("sch_1", "cancel");
    expect(api.listTodos).toHaveBeenCalledTimes(1); expect(api.listSchedules).toHaveBeenCalledTimes(1); c.dispose();
  });
  it("does not resend an uncertain creation or infer success from matching list content", async () => {
    const { controller: c, api, setRows } = setup();
    api.createSchedule.mockRejectedValue(new ApiError("timeout", 0, undefined, "TIMEOUT"));
    expect(await c.create("new")).toBe(false);
    setRows([{ ...row(), content: "new" }]); await c.refresh();
    expect(await c.create("new")).toBe(false); expect(api.createSchedule).toHaveBeenCalledTimes(1);
    expect(c.getState().issue?.text).toContain("创建结果未知"); expect(c.getState().feedback).toBeNull(); c.dispose();
  });
  it("retains acknowledgement/read failure for explicit GET-only verification", async () => {
    const { controller: c, api } = setup(); await c.refresh();
    api.listSchedules.mockRejectedValueOnce(new Error("offline"));
    expect(await c.act("sch_1", "done")).toBe(false); expect(c.getState().issue).not.toBeNull();
    await c.checkIssue(); expect(api.mutateSchedule).toHaveBeenCalledTimes(1);
    expect(c.getState().issue).toBeNull(); expect(c.getState().feedback?.text).toBe("已核对记录状态"); c.dispose();
  });
  it("preserves the invalidation that arrives while a list read is in flight", async () => {
    const { controller: c, api } = setup("reminder"); const first = deferred<Awaited<ReturnType<typeof api.listSchedules>>>();
    api.listSchedules.mockReturnValueOnce(first.promise);
    const reading = c.refresh(); void c.refresh();
    first.resolve({ items: [], unsupported: 0 }); await reading; await flush();
    expect(api.listSchedules).toHaveBeenCalledTimes(2); expect(c.getState().items).toHaveLength(1); c.dispose();
  });
  it("cancels old reads before writes and ignores their late snapshots", async () => {
    const { controller: c, api } = setup("reminder"); const first = deferred<Awaited<ReturnType<typeof api.listSchedules>>>();
    api.listSchedules.mockReturnValueOnce(first.promise); void c.refresh();
    await c.create("new"); first.resolve({ items: [], unsupported: 0 }); await flush();
    expect(api.listSchedules.mock.calls[0][0]?.signal?.aborted).toBe(true);
    expect(c.getState().items.some((item) => item.id === "sch_new")).toBe(true); c.dispose();
  });
  it("never cancels or restores a triggered alarm", async () => {
    const { controller: c, api, setRows } = setup("alarm"); setRows([row("alarm", "triggered")]); await c.refresh();
    expect(await c.act("sch_1", "cancel")).toBe(false); expect(await c.act("sch_1", "restore")).toBe(false);
    expect(api.mutateSchedule).not.toHaveBeenCalled(); c.dispose();
  });
  it("recovers reads from failure and distinguishes loading from an empty successful response", async () => {
    const { controller: c, api, setRows } = setup("reminder"); api.listSchedules.mockRejectedValueOnce(new ApiError("auth", 401));
    const reading = c.refresh(); expect(c.getState().loading).toBe(true); expect(c.getState().loaded).toBe(false);
    await reading; expect(c.getState().error).toContain("登录");
    setRows([]); await c.refresh(); expect(c.getState()).toMatchObject({ loaded: true, loading: false, items: [], error: null }); c.dispose();
  });
  it.each([401, 422])("keeps HTTP %i create rejection in the form without an unknown-write barrier", async (status) => {
    const { controller: c, api } = setup(); api.createSchedule.mockRejectedValue(new ApiError("bad", status));
    await c.create("new"); expect(c.getState().feedback?.error).toBe(true); expect(c.getState().issue).toBeNull(); c.dispose();
  });
  it("does not publish a late success into another view or after disposal", async () => {
    const { controller: c, api } = setup(); const creation = deferred<Schedule>(); api.createSchedule.mockReturnValueOnce(creation.promise);
    const running = c.create("new"); c.changeScope(); creation.resolve({ ...row(), id: "new", content: "new" }); await running;
    expect(c.getState().feedback).toBeNull(); c.dispose();
    const other = setup(); const late = deferred<Schedule>(); other.api.createSchedule.mockReturnValueOnce(late.promise);
    const subscriber = vi.fn(); other.controller.subscribe(subscriber); const pending = other.controller.create("new");
    other.controller.dispose(); const calls = subscriber.mock.calls.length; late.resolve(row()); await pending;
    expect(subscriber).toHaveBeenCalledTimes(calls); expect(other.api.createSchedule.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

describe("server timezone gating", () => {
  it("blocks alarm creation until the existing server timezone contract is read", async () => {
    const { controller: c, api } = setup("alarm"); expect(await c.create("wake", "2026-10-19 22:00")).toBe(false);
    expect(api.createSchedule).not.toHaveBeenCalled(); await c.loadZone();
    expect(c.getState().zone).toBe("Europe/Paris"); expect(await c.create("wake", "2026-10-19 22:00")).toBe(true);
    expect(api.createSchedule.mock.calls[0][0].triggerAt).toBe("2026-10-19 22:00"); c.dispose();
  });
  it("clears the previous zone when a new check fails rather than silently using it", async () => {
    const { controller: c, api } = setup("alarm"); await c.loadZone(); api.getTriggerConfig.mockRejectedValueOnce(new Error("missing contract"));
    await c.loadZone(); expect(c.getState().zone).toBeNull(); expect(c.getState().zoneError).toContain("暂不能创建");
    await c.create("wake", "2026-10-19 22:00"); expect(api.createSchedule).not.toHaveBeenCalled(); c.dispose();
  });
  it.each([401, 503, 422])("formats HTTP %i without leaking raw backend diagnostics", (status) => {
    expect(scheduleFailure(new ApiError("private", status))).not.toContain("private");
  });
});
