import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { createDiaryChatController } from "./diary-chat-controller";
import { presentDiaryTimeline } from "@/components/diary/diary-chat-presenter";
import type { DiaryRegenerateEvent } from "@/domain/diary/diary-chat-send-client";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";

const row = (id: string, role = "assistant", entryId = "a", content = "相同正文"): DiaryMessage => ({ id, role, entryId, content, createdAt: 1, updatedAt: null, thinking: null, drift: null });
const original = [row("u", "user"), row("old"), row("later-u", "user"), row("later-ai")];
const start: DiaryRegenerateEvent = { type: "start", entryId: "a", assistantId: "new", replacedIds: ["old", "later-u", "later-ai"] };
const done: DiaryRegenerateEvent = { type: "done", message: row("new"), drift: null, thinking: null };
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function channel() {
  const queue: IteratorResult<DiaryRegenerateEvent>[] = [];
  let wake: ((next: IteratorResult<DiaryRegenerateEvent>) => void) | undefined;
  const next = (value: IteratorResult<DiaryRegenerateEvent>) => { if (wake) { const fn = wake; wake = undefined; fn(value); } else queue.push(value); };
  return { push: (value: DiaryRegenerateEvent) => next({ done: false, value }), end: () => next({ done: true, value: undefined }),
    async *read() { while (true) { const value = queue.shift() ?? await new Promise<IteratorResult<DiaryRegenerateEvent>>(resolve => { wake = resolve; }); if (value.done) return; yield value.value; } } };
}
async function setup() {
  const wire = channel();
  const deps = { getEntry: vi.fn(async (id: string) => ({ id, date: "2020-01-02", status: "writing", title: null })),
    getMessages: vi.fn(async (id: string): Promise<readonly DiaryMessage[]> => id === "a" ? original : [row("b-user", "user", id)]),
    mutateMessage: vi.fn(async (_entry: string, _id: string, _content: string | null, _signal: AbortSignal) => {}),
    regenerateMessage: vi.fn((_entry: string, _id: string, _signal: AbortSignal) => wire.read()),
    sendMessage: vi.fn(async function* () {}) };
  const c = createDiaryChatController(deps); await c.open("a");
  const visible = () => { const s = c.getState(); return presentDiaryTimeline(s.entryId!, s.messages, s.overlays); };
  return { c, deps, wire, visible };
}
afterEach(() => vi.useRealTimers());

describe("Diary persisted message mutations", () => {
  it("edits exact user content, rereads history in server order and does not generate", async () => {
    const { c, deps } = await setup();
    const content = "\n  编辑草稿\n\n原样保存  \n";
    const saved = { ...original[0], content };
    deps.getMessages.mockResolvedValue([saved, ...original.slice(1)]);
    await c.edit(original[0], content);
    expect(deps.mutateMessage.mock.calls[0].slice(0, 3)).toEqual(["a", "u", content]);
    expect(c.getState().messages).toEqual([saved, ...original.slice(1)]);
    expect(c.getState().mutation).toBeNull(); expect(deps.sendMessage).not.toHaveBeenCalled(); expect(deps.regenerateMessage).not.toHaveBeenCalled(); c.dispose();
  });
  it.each(["request", "history", "mismatch", "missing"])("rejects an edit on %s failure without a false success", async failure => {
    const { c, deps } = await setup();
    if (failure === "request") deps.mutateMessage.mockRejectedValueOnce(new Error("private"));
    if (failure === "history") deps.getMessages.mockRejectedValueOnce(new Error("private"));
    if (failure === "missing") deps.getMessages.mockResolvedValue(original.slice(1));
    await expect(c.edit(original[0], "draft")).rejects.toThrow(failure === "missing" ? "不存在" : failure === "mismatch" ? "不一致" : "尚未确认");
    expect(c.getState().mutation).toBeNull();
    if (failure !== "missing") expect(c.getState().messages).toEqual(original);
    expect(deps.getMessages).toHaveBeenCalledTimes(2); c.dispose();
  });
  it.each([0, 1])("deletes saved role at index %s only after the request and authoritative read", async index => {
    const { c, deps } = await setup(); const request = deferred<void>(); deps.mutateMessage.mockReturnValueOnce(request.promise);
    const target = original[index], task = c.delete(target);
    expect(c.getState().messages).toEqual(original); expect(await c.send("blocked")).toBe(false);
    await expect(c.delete(target)).rejects.toThrow("不可操作");
    const history = original.filter(row => row.id !== target.id); deps.getMessages.mockResolvedValue(history);
    request.resolve(); await task;
    expect(c.getState().messages).toEqual(history); expect(deps.mutateMessage.mock.calls[0].slice(0, 3)).toEqual(["a", target.id, null]); c.dispose();
  });
  it("preserves the deleted target on HTTP failure and releases the local operation", async () => {
    const { c, deps } = await setup(); deps.mutateMessage.mockRejectedValueOnce(new Error("failed"));
    await expect(c.delete(original[1])).rejects.toThrow("尚未确认");
    expect(c.getState().messages).toEqual(original); expect(c.getState().mutation).toBeNull(); c.dispose();
  });
  it("does not call a mutation for another Entry, unknown roles, an assistant edit or absent IDs", async () => {
    const { c, deps } = await setup();
    for (const target of [row("u", "user", "b"), row("missing", "user"), original[1]]) await expect(c.edit(target, "draft")).rejects.toThrow();
    expect(() => c.regenerate(original[0])).toThrow(); expect(deps.mutateMessage).not.toHaveBeenCalled(); c.dispose();
  });
  it.each(["edit", "delete"] as const)("isolates late %s acknowledgements and does not refresh another Entry", async kind => {
    const { c, deps } = await setup(); const request = deferred<void>(); deps.mutateMessage.mockReturnValueOnce(request.promise);
    const task = (kind === "edit" ? c.edit(original[0], "draft") : c.delete(original[0])).catch(error => error);
    await c.open("b"); expect(deps.mutateMessage.mock.calls[0][3].aborted).toBe(true);
    request.resolve(); await task;
    expect(c.getState()).toMatchObject({ entryId: "b", mutation: null, messages: [row("b-user", "user", "b")] });
    expect(deps.getMessages.mock.calls.map(call => call[0])).toEqual(["a", "b"]); c.dispose();
  });
  it("isolates a late mutation history read and coalesces WS invalidation while mutating", async () => {
    vi.useFakeTimers(); const { c, deps } = await setup(); const history = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(history.promise);
    const task = c.edit(original[0], "draft").catch(error => error); await settle();
    c.handleEvent({ type: "diary-message-created", entryId: "a", messageId: "x" }); await vi.advanceTimersByTimeAsync(200);
    expect(deps.getMessages).toHaveBeenCalledTimes(2);
    await c.open("b"); history.resolve([{ ...original[0], content: "draft" }]); await task;
    expect(c.getState().entryId).toBe("b"); expect(c.getState().messages?.[0].entryId).toBe("b"); c.dispose();
  });
});

describe("Diary regeneration uses the existing Entry stream and exact replacement suffix", () => {
  it.each(["ws-first", "done-first", "ws-before-start"])("converges under %s, retaining equal prose under distinct IDs", async order => {
    vi.useFakeTimers(); const { c, deps, wire, visible } = await setup(); const task = c.regenerate(original[1]);
    expect(c.getState().messages).toEqual(original); expect(await c.send("blocked")).toBe(false);
    const appended = row("concurrent");
    deps.getMessages.mockResolvedValue([original[0], appended, row("new")]);
    if (order !== "ws-before-start") { wire.push(start); wire.push({ type: "chunk", content: "raw" }); await settle(); }
    if (order !== "done-first") { c.handleEvent({ type: "diary-message-created", entryId: "a", messageId: "new" }); await vi.advanceTimersByTimeAsync(200); }
    if (order === "ws-before-start") wire.push(start);
    wire.push({ type: "chunk", content: "must not overwrite saved text" }); wire.push(done); wire.end();
    expect(await task).toBe(true); await settle();
    expect(visible().map(row => row.id)).toEqual(["u", "concurrent", "new"]); expect(visible().filter(row => row.id === "new")).toHaveLength(1);
    expect(visible().every(row => row.content === "相同正文")).toBe(true); expect(deps.regenerateMessage.mock.calls[0].slice(0, 2)).toEqual(["a", "old"]); c.dispose();
  });
  it("retains the original suffix through chunks and on failed generation without provisional leftovers", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.regenerate(original[1]);
    wire.push(start); wire.push({ type: "chunk", content: "partial" }); await settle(); expect(c.getState().messages).toEqual(original);
    wire.push({ type: "error" }); wire.end(); expect(await task).toBe(false); await settle();
    expect(visible().map(row => row.id)).toEqual(original.map(row => row.id)); expect(c.getState().sendError).toContain("核对"); expect(deps.regenerateMessage).toHaveBeenCalledOnce(); c.dispose();
  });
  it("a receipt replaces only the announced suffix when GET fails, preserving concurrent append", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.regenerate(original[1]); wire.push(start); await settle();
    deps.getMessages.mockResolvedValueOnce([...original, row("concurrent")]); await c.refresh();
    deps.getMessages.mockRejectedValueOnce(new Error("offline")); wire.push(done); wire.end(); await task; await settle();
    expect(visible().map(row => row.id)).toEqual(["u", "concurrent", "new"]); expect(c.getState().error?.source).toBe("history"); c.dispose();
  });
  it("cancels an older in-flight snapshot at receipt so it cannot resurrect the removed suffix", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.regenerate(original[1]); wire.push(start); await settle();
    const late = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(late.promise); const oldRead = c.refresh(); await settle();
    wire.push(done); await settle(); late.resolve(original); await oldRead;
    expect(visible().map(row => row.id)).toEqual(["u", "new"]);
    deps.getMessages.mockResolvedValue([original[0], row("new")]); wire.end(); await task; await settle(); c.dispose();
  });
  it("reads history after an unknown network outcome and never retries the POST", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.regenerate(original[1]); wire.push(start); wire.end();
    deps.getMessages.mockResolvedValue([original[0], row("new")]); expect(await task).toBe(false); await settle();
    expect(visible().map(row => row.id)).toEqual(["u", "new"]); expect(deps.regenerateMessage).toHaveBeenCalledOnce(); expect(c.getState().sendError).toContain("重复提交"); c.dispose();
  });
  it("blocks another operation until the unknown outcome has received its one history reread", async () => {
    const { c, deps, wire } = await setup(); const history = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(history.promise);
    const task = c.regenerate(original[1]); wire.push(start); wire.end(); await settle();
    expect(c.getState().sending).toBe(true); expect(await c.send("too early")).toBe(false); expect(() => c.regenerate(original[1])).toThrow();
    history.resolve(original); await task; expect(c.getState().sending).toBe(false); c.dispose();
  });
  it("isolates late SSE after switching Entry and supports a later same-Entry manual send", async () => {
    const { c, deps, wire } = await setup(); const task = c.regenerate(original[1]); wire.push(start); await settle();
    await c.open("b"); wire.push(done); wire.end(); expect(await task).toBe(false); await settle();
    expect(c.getState()).toMatchObject({ entryId: "b", overlays: [], sending: false }); expect(deps.regenerateMessage.mock.calls[0][2].aborted).toBe(true);
    await c.send("自动投喂后继续聊天"); expect(deps.sendMessage.mock.calls).toHaveLength(1); c.dispose();
  });
});


describe("Diary configuration rejection feedback", () => {
  it("recognizes only missing_base_url, keeps the original suffix and still rereads once", async () => {
    const { c, deps } = await setup();
    deps.regenerateMessage.mockImplementationOnce(async function* () { throw new ApiError("private upstream detail", 422, { detail: { code: "missing_base_url", key: "private" } }); });
    expect(await c.regenerate(original[1])).toBe(false);
    expect(c.getState()).toMatchObject({ messages: original, overlays: [], sending: false, sendError: "当前模型配置缺少 API 地址，请检查模型设置。" });
    expect(deps.getMessages).toHaveBeenCalledTimes(2); expect(deps.regenerateMessage).toHaveBeenCalledOnce(); c.dispose();
  });
  it.each([[422, "other_configuration_error"], [500, "missing_base_url"], [422, null]])("keeps unknown status/code %s/%s on the existing safe error path", async (status, code) => {
    const { c, deps } = await setup();
    deps.regenerateMessage.mockImplementationOnce(async function* () { throw new ApiError("private secret", status as number, { detail: { code } }); });
    expect(await c.regenerate(original[1])).toBe(false); expect(c.getState().sendError).toContain("待核对");
    expect(c.getState().sendError).not.toContain("API 地址"); expect(c.getState().sendError).not.toContain("private"); expect(c.getState().messages).toEqual(original); c.dispose();
  });
});
