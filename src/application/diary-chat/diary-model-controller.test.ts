import { describe, expect, it, vi } from "vitest";
import { createDiaryModelController } from "./diary-model-controller";
import type { DiaryModelConfiguration } from "@/domain/diary/diary-model-client";
import { ApiError } from "@/lib/api";
const config = (entryId: string, independent = false, model = "current"): DiaryModelConfiguration => ({ entryId, independent,
  saved: independent ? { connectionId: "a", protocol: "anthropic_messages", model } : null,
  display: { connections: [], allowedProtocols: ["anthropic_messages"], diagnostic: null, selection: { connectionId: "a", protocol: "anthropic_messages", model } } });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup() { const deps = { get: vi.fn(async (id: string) => config(id)), save: vi.fn(async (id: string, value: { model: string }) => config(id, true, value.model)) }; return { deps, c: createDiaryModelController(deps) }; }
describe("Entry model explicit-save lifecycle", () => {
  it("loads effective compatibility, stages every field without writing and cancels to the confirmed snapshot", async () => {
    const { c, deps } = setup(); await c.open("a"); expect(c.getState().configuration?.independent).toBe(false);
    c.change({ connectionId: "b" }); c.change({ protocol: "openai_chat_completions", model: "typed" }); expect(deps.save).not.toHaveBeenCalled();
    c.cancel(); expect(c.getState()).toMatchObject({ dirty: false, draft: { connectionId: "a", protocol: "anthropic_messages", model: "current" } }); c.dispose();
  });
  it("can explicitly persist the effective compatibility choice without changing it", async () => {
    const { c, deps } = setup(); await c.open("a"); expect(c.getState().dirty).toBe(false);
    await c.save(); expect(deps.save).toHaveBeenCalledOnce(); expect(c.getState().configuration?.independent).toBe(true);
    await c.save(); expect(deps.save).toHaveBeenCalledOnce(); c.dispose();
  });
  it("saves explicitly, checks duplicate submission, then exposes the persisted choice", async () => {
    const { c, deps } = setup(); await c.open("a"); c.change({ model: " new/model " }); const pending = deferred<DiaryModelConfiguration>(); deps.save.mockReturnValueOnce(pending.promise);
    const task = c.save(); await c.save(); expect(deps.save).toHaveBeenCalledOnce(); expect(c.getState().pending).toBe(true);
    expect(deps.save.mock.calls[0].slice(0, 2)).toEqual(["a", { connectionId: "a", protocol: "anthropic_messages", model: "new/model" }]);
    pending.resolve(config("a", true, "new/model")); await task; expect(c.getState()).toMatchObject({ dirty: false, pending: false, draft: { model: "new/model" } }); c.dispose();
  });
  it.each([new ApiError("private", 422), new Error("private")])("keeps the draft on rejection/unknown failure and refreshes without another PUT", async error => {
    const { c, deps } = setup(); await c.open("a"); c.change({ model: "draft" }); deps.save.mockRejectedValueOnce(error); await c.save();
    expect(c.getState()).toMatchObject({ dirty: true, pending: false, draft: { model: "draft" } }); expect(c.getState().notice).toContain("已保留"); expect(c.getState().notice).not.toContain("private");
    await c.refresh(); expect(c.getState().draft.model).toBe("draft"); expect(deps.save).toHaveBeenCalledOnce();
    deps.get.mockResolvedValueOnce(config("a", true, "draft")); await c.refresh(); expect(c.getState().dirty).toBe(false); c.dispose();
  });
  it("keeps send-independent read failures recoverable", async () => {
    const { c, deps } = setup(); deps.get.mockRejectedValueOnce(new Error("private")); await c.open("a");
    expect(c.getState()).toMatchObject({ loading: false, configuration: null }); await c.refresh(); expect(c.getState().configuration?.entryId).toBe("a"); c.dispose();
  });
  it.each(["read", "save"])("ignores late %s results after Entry changes or disposal", async operation => {
    const { c, deps } = setup(); await c.open("a"); const late = deferred<DiaryModelConfiguration>();
    let task: Promise<unknown>;
    if (operation === "read") { deps.get.mockReturnValueOnce(late.promise); task = c.refresh(); }
    else { c.change({ model: "draft-a" }); deps.save.mockReturnValueOnce(late.promise); task = c.save(); }
    await c.open("b"); late.resolve(config("a", true, "late-a")); await task;
    expect(c.getState()).toMatchObject({ entryId: "b", draft: { model: "current" }, pending: false }); c.dispose();
  });
});
